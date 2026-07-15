import { customAlphabet } from 'nanoid';

const nano = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5);

/** Generate an order number like ORD-20260714-7KQ2P. */
export function generateOrderNumber(date = new Date()): string {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `ORD-${ymd}-${nano()}`;
}
