import { round2 } from '../../common/utils/money.util';

export interface CheckoutLine {
  variantId: string;
  quantity: number;
  unitPrice: number;
}

export interface CheckoutTotalsInput {
  lines: CheckoutLine[];
  discount: number;
  shipping: number;
  taxRate: number;
}

export interface CheckoutTotals {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
}

/**
 * Pure, deterministic order-total calculation. Kept free of I/O so it can be
 * unit-tested exhaustively. Tax is applied to (subtotal - discount).
 */
export function calculateTotals(input: CheckoutTotalsInput): CheckoutTotals {
  const subtotal = round2(input.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0));
  const discount = round2(Math.min(input.discount, subtotal));
  const taxableBase = Math.max(subtotal - discount, 0);
  const tax = round2(taxableBase * input.taxRate);
  const shipping = round2(Math.max(input.shipping, 0));
  const total = round2(subtotal - discount + tax + shipping);
  return { subtotal, discount, shipping, tax, total };
}
