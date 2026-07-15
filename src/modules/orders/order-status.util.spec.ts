import { OrderStatus } from '@prisma/client';
import { canTransition } from './order-status.util';
import { generateOrderNumber } from './order-number.util';

describe('canTransition', () => {
  it('allows pending_payment → confirmed', () => {
    expect(canTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED)).toBe(true);
  });

  it('allows confirmed → processing → shipped → delivered', () => {
    expect(canTransition(OrderStatus.CONFIRMED, OrderStatus.PROCESSING)).toBe(true);
    expect(canTransition(OrderStatus.PROCESSING, OrderStatus.SHIPPED)).toBe(true);
    expect(canTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED)).toBe(true);
  });

  it('forbids going backwards', () => {
    expect(canTransition(OrderStatus.SHIPPED, OrderStatus.PROCESSING)).toBe(false);
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.CONFIRMED)).toBe(false);
  });

  it('forbids transitions out of terminal states', () => {
    expect(canTransition(OrderStatus.CANCELED, OrderStatus.CONFIRMED)).toBe(false);
    expect(canTransition(OrderStatus.REFUNDED, OrderStatus.SHIPPED)).toBe(false);
  });
});

describe('generateOrderNumber', () => {
  it('encodes the date and a random suffix', () => {
    const n = generateOrderNumber(new Date('2026-07-14T10:00:00Z'));
    expect(n).toMatch(/^ORD-20260714-[A-Z0-9]{5}$/);
  });

  it('produces unique numbers', () => {
    const a = generateOrderNumber();
    const b = generateOrderNumber();
    expect(a).not.toBe(b);
  });
});
