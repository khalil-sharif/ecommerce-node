import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShippingMethod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { round2, toNumber } from '../../common/utils/money.util';

export interface ShippingQuote {
  method: ShippingMethod;
  cost: number;
  estimatedDays: number;
  estimatedDeliveryDate: string;
  freeShippingApplied: boolean;
}

/**
 * Weight- and destination-based shipping. Rates are read from the
 * shipping_rates table, falling back to sensible defaults when no row matches.
 */
@Injectable()
export class ShippingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async quote(params: {
    country: string;
    state?: string;
    totalWeightKg: number;
    subtotal: number;
    method?: ShippingMethod;
    freeShippingOverride?: boolean;
  }): Promise<ShippingQuote> {
    const method = params.method ?? ShippingMethod.STANDARD;
    const threshold = this.config.get<number>('commerce.freeShippingThreshold')!;

    const rate = await this.resolveRate(params.country, params.state, method);
    let cost = round2(rate.baseRate + rate.perKgRate * Math.max(params.totalWeightKg, 0));

    const freeShippingApplied =
      params.freeShippingOverride === true ||
      (method === ShippingMethod.STANDARD && params.subtotal >= threshold);
    if (freeShippingApplied) cost = 0;

    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + rate.estimatedDays);

    return {
      method,
      cost,
      estimatedDays: rate.estimatedDays,
      estimatedDeliveryDate: deliveryDate.toISOString().slice(0, 10),
      freeShippingApplied,
    };
  }

  async quoteAll(params: {
    country: string;
    state?: string;
    totalWeightKg: number;
    subtotal: number;
  }): Promise<ShippingQuote[]> {
    return Promise.all([
      this.quote({ ...params, method: ShippingMethod.STANDARD }),
      this.quote({ ...params, method: ShippingMethod.EXPRESS }),
    ]);
  }

  private async resolveRate(country: string, state: string | undefined, method: ShippingMethod) {
    const row =
      (await this.prisma.shippingRate.findFirst({
        where: { country, state: state ?? undefined, method, isActive: true },
      })) ??
      (await this.prisma.shippingRate.findFirst({
        where: { country, state: null, method, isActive: true },
      }));

    if (row) {
      return {
        baseRate: toNumber(row.baseRate),
        perKgRate: toNumber(row.perKgRate),
        estimatedDays: row.estimatedDays,
      };
    }
    // Defaults when no rate table row exists.
    return method === ShippingMethod.EXPRESS
      ? { baseRate: 20, perKgRate: 2.5, estimatedDays: 2 }
      : { baseRate: 8, perKgRate: 1, estimatedDays: 5 };
  }
}
