import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Order, OrderStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CouponsService } from '../coupons/coupons.service';
import { StripeService } from './stripe.service';
import { QUEUES, JOBS } from '../../queue/queue.constants';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly coupons: CouponsService,
    private readonly stripe: StripeService,
    @InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue,
  ) {}

  /**
   * Idempotent webhook dispatch. The event id is recorded before handling; a
   * duplicate delivery short-circuits.
   */
  async handleWebhook(event: Stripe.Event): Promise<{ received: boolean; duplicate?: boolean }> {
    const already = await this.prisma.processedWebhookEvent.findUnique({
      where: { eventId: event.id },
    });
    if (already) return { received: true, duplicate: true };

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.onPaymentSucceeded(event.data.object as Stripe.PaymentIntent);
          break;
        case 'payment_intent.payment_failed':
          await this.onPaymentFailed(event.data.object as Stripe.PaymentIntent);
          break;
        case 'charge.refunded':
          await this.onChargeRefunded(event.data.object as Stripe.Charge);
          break;
        default:
          this.logger.debug(`Unhandled event type ${event.type}`);
      }
    } finally {
      await this.prisma.processedWebhookEvent.create({
        data: { eventId: event.id, type: event.type },
      });
    }
    return { received: true };
  }

  private async onPaymentSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
    const order = await this.orderForIntent(pi.id, pi.metadata?.orderId);
    if (!order || order.status === OrderStatus.CONFIRMED) return;

    await this.prisma.$transaction(async (tx) => {
      const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
      for (const item of items) {
        await this.inventory.commit(item.productVariantId, item.quantity, order.orderNumber, tx);
      }
      if (order.couponCode) await this.coupons.consume(order.couponCode, tx);
      await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.CONFIRMED } });
    });

    const email = await this.orderEmail(order);
    await this.emailQueue.add(JOBS.ORDER_CONFIRMATION, { orderNumber: order.orderNumber, email });
    this.logger.log(`Order ${order.orderNumber} confirmed`);
  }

  private async onPaymentFailed(pi: Stripe.PaymentIntent): Promise<void> {
    const order = await this.orderForIntent(pi.id, pi.metadata?.orderId);
    if (!order || order.status !== OrderStatus.PENDING_PAYMENT) return;

    await this.prisma.$transaction(async (tx) => {
      const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
      for (const item of items) {
        await this.inventory.release(item.productVariantId, item.quantity, order.orderNumber, tx);
      }
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PAYMENT_FAILED },
      });
    });
    this.logger.warn(`Order ${order.orderNumber} payment failed`);
  }

  private async onChargeRefunded(charge: Stripe.Charge): Promise<void> {
    const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (!intentId) return;
    const order = await this.orderForIntent(intentId);
    if (!order || order.status === OrderStatus.REFUNDED) return;

    await this.prisma.$transaction(async (tx) => {
      const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
      for (const item of items) {
        await this.inventory.restore(item.productVariantId, item.quantity, order.orderNumber, tx);
      }
      await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.REFUNDED } });
    });
    this.logger.log(`Order ${order.orderNumber} refunded`);
  }

  /** Admin-initiated refund (full or partial). */
  async refundOrder(orderId: string, amount?: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.stripePaymentIntentId) throw new NotFoundException('Order has no payment');
    const refund = await this.stripe.refund({
      paymentIntentId: order.stripePaymentIntentId,
      amount,
    });
    return { refundId: refund.id, status: refund.status };
  }

  private async orderForIntent(intentId: string, orderId?: string): Promise<Order | null> {
    if (orderId) {
      const byId = await this.prisma.order.findUnique({ where: { id: orderId } });
      if (byId) return byId;
    }
    return this.prisma.order.findFirst({ where: { stripePaymentIntentId: intentId } });
  }

  private async orderEmail(order: Order): Promise<string | null> {
    if (!order.userId) return null;
    const user = await this.prisma.user.findUnique({ where: { id: order.userId } });
    return user?.email ?? null;
  }
}
