import { Injectable } from '@nestjs/common';
import { round2 } from '../../common/utils/money.util';

/**
 * Simple destination-based tax. Rates are keyed by country (and optionally
 * state for the US). Applied to the taxable base (subtotal - discount).
 */
@Injectable()
export class TaxService {
  private readonly countryRates: Record<string, number> = {
    US: 0, // handled per-state below
    CA: 0.05,
    GB: 0.2,
    DE: 0.19,
    FR: 0.2,
    AU: 0.1,
  };

  private readonly usStateRates: Record<string, number> = {
    CA: 0.0725,
    NY: 0.08875,
    TX: 0.0625,
    FL: 0.06,
    WA: 0.065,
  };

  getRate(country: string, state?: string): number {
    const c = country?.toUpperCase();
    if (c === 'US') return this.usStateRates[state?.toUpperCase() ?? ''] ?? 0;
    return this.countryRates[c] ?? 0;
  }

  calculate(taxableBase: number, country: string, state?: string): { rate: number; amount: number } {
    const rate = this.getRate(country, state);
    return { rate, amount: round2(Math.max(taxableBase, 0) * rate) };
  }
}
