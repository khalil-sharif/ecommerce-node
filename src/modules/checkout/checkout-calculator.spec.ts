import { calculateTotals } from './checkout-calculator';

describe('calculateTotals', () => {
  const lines = [
    { variantId: 'a', quantity: 2, unitPrice: 50 }, // 100
    { variantId: 'b', quantity: 1, unitPrice: 25.5 }, // 25.5
  ];

  it('sums line totals into the subtotal', () => {
    const t = calculateTotals({ lines, discount: 0, shipping: 0, taxRate: 0 });
    expect(t.subtotal).toBe(125.5);
    expect(t.total).toBe(125.5);
  });

  it('applies a fixed discount before tax', () => {
    const t = calculateTotals({ lines, discount: 25.5, shipping: 0, taxRate: 0.1 });
    expect(t.discount).toBe(25.5);
    // taxable base = 100, tax = 10
    expect(t.tax).toBe(10);
    expect(t.total).toBe(110);
  });

  it('never lets the discount exceed the subtotal', () => {
    const t = calculateTotals({ lines, discount: 999, shipping: 5, taxRate: 0 });
    expect(t.discount).toBe(125.5);
    expect(t.total).toBe(5); // just shipping
  });

  it('adds shipping on top of the taxed total', () => {
    const t = calculateTotals({ lines, discount: 0, shipping: 8.99, taxRate: 0.2 });
    expect(t.tax).toBe(25.1);
    expect(t.total).toBe(159.59);
  });

  it('rounds to two decimal places', () => {
    const t = calculateTotals({
      lines: [{ variantId: 'x', quantity: 3, unitPrice: 9.99 }],
      discount: 0,
      shipping: 0,
      taxRate: 0.0825,
    });
    expect(t.subtotal).toBe(29.97);
    expect(t.tax).toBe(2.47);
    expect(t.total).toBe(32.44);
  });
});
