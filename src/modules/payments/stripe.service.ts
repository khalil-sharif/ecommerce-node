import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { toMinorUnits } from '../../common/utils/money.util';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    this.webhookSecret = config.get<string>('stripe.webhookSecret')!;
    this.stripe = new Stripe(config.get<string>('stripe.secretKey')!, {
      apiVersion: '2024-04-10',
    });
  }

  async createPaymentIntent(params: {
    amount: number;
    currency: string;
    metadata: Record<string, string>;
  }): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.create({
      amount: toMinorUnits(params.amount),
      currency: params.currency,
      metadata: params.metadata,
      automatic_payment_methods: { enabled: true },
    });
  }

  async cancelPaymentIntent(id: string): Promise<void> {
    try {
      await this.stripe.paymentIntents.cancel(id);
    } catch (err) {
      this.logger.warn(`Could not cancel PaymentIntent ${id}: ${(err as Error).message}`);
    }
  }

  async refund(params: {
    paymentIntentId: string;
    amount?: number;
  }): Promise<Stripe.Refund> {
    return this.stripe.refunds.create({
      payment_intent: params.paymentIntentId,
      ...(params.amount != null ? { amount: toMinorUnits(params.amount) } : {}),
    });
  }

  /** Verify webhook signature and return the typed event. Throws on mismatch. */
  constructEvent(payload: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
  }
}
