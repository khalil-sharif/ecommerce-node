import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ShippingMethod } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CartService, CartContext } from '../cart/cart.service';
import { CouponsService } from '../coupons/coupons.service';
import { ShippingService } from '../shipping/shipping.service';
import { TaxService } from '../shipping/tax.service';
import { InventoryService } from '../inventory/inventory.service';
import { StripeService } from '../payments/stripe.service';
import { QUEUES, JOBS } from '../../queue/queue.constants';
import { toNumber } from '../../common/utils/money.util';
import { generateOrderNumber } from '../orders/order-number.util';
import { calculateTotals, CheckoutLine } from './checkout-calculator';
import { CheckoutDto } from './dto/checkout.dto';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly coupons: CouponsService,
    private readonly shipping: ShippingService,
    private readonly tax: TaxService,
    private readonly inventory: InventoryService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue,
  ) {}

  /**
   * Full checkout: validate stock + coupon, price the order, reserve inventory,
   * create a PENDING_PAYMENT order and a Stripe PaymentIntent. Returns the
   * client_secret for the frontend to confirm payment.
   */
  async checkout(ctx: CartContext, dto: CheckoutDto, userEmail?: string) {
    const cart = await this.cart.resolveCart(ctx, false);
    const detailed = await this.prisma.cart.findUnique({
      where: { id: cart.id },
      include: { items: { include: { variant: { include: { product: true } } } } },
    });
    if (!detailed || detailed.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // 1. Validate stock for every line.
    const lines: CheckoutLine[] = [];
    let totalWeight = 0;
    const productIds: string[] = [];
    for (const item of detailed.items) {
      await this.inventory.assertAvailable(item.productVariantId, item.quantity);
      const unitPrice = toNumber(item.variant.priceOverride ?? item.variant.product.basePrice);
      lines.push({ variantId: item.productVariantId, quantity: item.quantity, unitPrice });
      totalWeight += toNumber(item.variant.product.weight) * item.quantity;
      productIds.push(item.variant.productId);
    }

    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

    // 2. Coupon.
    let discount = 0;
    let freeShipping = false;
    if (dto.couponCode) {
      const applied = await this.coupons.validate(dto.couponCode, subtotal, { productIds });
      discount = applied.discount;
      freeShipping = applied.freeShipping;
    }

    // 3. Shipping + tax.
    const method = dto.shippingMethod ?? ShippingMethod.STANDARD;
    const shippingQuote = await this.shipping.quote({
      country: dto.shippingAddress.country,
      state: dto.shippingAddress.state,
      totalWeightKg: totalWeight,
      subtotal,
      method,
      freeShippingOverride: freeShipping,
    });
    const taxRate = this.tax.getRate(dto.shippingAddress.country, dto.shippingAddress.state);

    // 4. Totals.
    const totals = calculateTotals({ lines, discount, shipping: shippingQuote.cost, taxRate });
    const currency = this.config.get<string>('commerce.defaultCurrency')!;

    // 5. Persist order + reserve stock atomically.
    const orderNumber = generateOrderNumber();
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId: ctx.userId ?? null,
          orderNumber,
          status: 'PENDING_PAYMENT',
          subtotal: totals.subtotal,
          tax: totals.tax,
          shipping: totals.shipping,
          discount: totals.discount,
          total: totals.total,
          currency,
          shippingAddressJson: dto.shippingAddress as unknown as Prisma.InputJsonValue,
          billingAddressJson: dto.billingAddress as unknown as Prisma.InputJsonValue,
          couponCode: dto.couponCode?.toUpperCase() ?? null,
          items: {
            create: detailed.items.map((item) => {
              const unitPrice = toNumber(
                item.variant.priceOverride ?? item.variant.product.basePrice,
              );
              return {
                productVariantId: item.productVariantId,
                productName: item.variant.product.name,
                variantName: item.variant.name,
                sku: item.variant.sku,
                quantity: item.quantity,
                unitPrice,
                total: Math.round(unitPrice * item.quantity * 100) / 100,
              };
            }),
          },
        },
      });

      for (const line of lines) {
        await this.inventory.reserve(line.variantId, line.quantity, orderNumber, tx);
      }
      return created;
    });

    // 6. Stripe PaymentIntent.
    const paymentIntent = await this.stripe.createPaymentIntent({
      amount: totals.total,
      currency,
      metadata: { orderId: order.id, orderNumber },
    });
    await this.prisma.order.update({
      where: { id: order.id },
      data: { stripePaymentIntentId: paymentIntent.id },
    });

    return {
      orderId: order.id,
      orderNumber,
      totals,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      estimatedDelivery: shippingQuote.estimatedDeliveryDate,
    };
  }
}
