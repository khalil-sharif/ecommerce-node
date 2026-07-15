import { TaxService } from './tax.service';

describe('TaxService', () => {
  const service = new TaxService();

  it('resolves US state rates', () => {
    expect(service.getRate('US', 'CA')).toBeCloseTo(0.0725);
    expect(service.getRate('us', 'ny')).toBeCloseTo(0.08875);
  });

  it('falls back to 0 for unknown US states', () => {
    expect(service.getRate('US', 'ZZ')).toBe(0);
  });

  it('uses country rates outside the US', () => {
    expect(service.getRate('GB')).toBeCloseTo(0.2);
    expect(service.getRate('DE')).toBeCloseTo(0.19);
  });

  it('calculates tax on the taxable base', () => {
    const { rate, amount } = service.calculate(200, 'GB');
    expect(rate).toBeCloseTo(0.2);
    expect(amount).toBe(40);
  });

  it('never taxes a negative base', () => {
    expect(service.calculate(-10, 'GB').amount).toBe(0);
  });
});
