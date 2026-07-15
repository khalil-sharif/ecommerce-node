import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CouponType } from '@prisma/client';
import { CouponsService } from './coupons.service';

function makeCoupon(overrides: Partial<any> = {}) {
  return {
    id: 'c1',
    code: 'SAVE10',
    type: CouponType.PERCENTAGE,
    value: 10,
    minOrderAmount: 0,
    maxDiscountAmount: null,
    maxUses: null,
    usedCount: 0,
    validFrom: null,
    validUntil: null,
    isActive: true,
    applicableProducts: [],
    applicableCategories: [],
    ...overrides,
  };
}

describe('CouponsService.validate', () => {
  let service: CouponsService;
  let prisma: { coupon: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { coupon: { findUnique: jest.fn() } };
    service = new CouponsService(prisma as any);
  });

  it('throws when the coupon does not exist', async () => {
    prisma.coupon.findUnique.mockResolvedValue(null);
    await expect(service.validate('NOPE', 100)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('computes a percentage discount', async () => {
    prisma.coupon.findUnique.mockResolvedValue(makeCoupon({ value: 10 }));
    const res = await service.validate('SAVE10', 200);
    expect(res.discount).toBe(20);
    expect(res.freeShipping).toBe(false);
  });

  it('caps a percentage discount at maxDiscountAmount', async () => {
    prisma.coupon.findUnique.mockResolvedValue(makeCoupon({ value: 50, maxDiscountAmount: 30 }));
    const res = await service.validate('SAVE10', 200);
    expect(res.discount).toBe(30);
  });

  it('never discounts more than the subtotal for fixed amounts', async () => {
    prisma.coupon.findUnique.mockResolvedValue(
      makeCoupon({ type: CouponType.FIXED_AMOUNT, value: 75 }),
    );
    const res = await service.validate('SAVE10', 40);
    expect(res.discount).toBe(40);
  });

  it('flags free shipping coupons', async () => {
    prisma.coupon.findUnique.mockResolvedValue(
      makeCoupon({ type: CouponType.FREE_SHIPPING, value: 0 }),
    );
    const res = await service.validate('SAVE10', 40);
    expect(res.freeShipping).toBe(true);
    expect(res.discount).toBe(0);
  });

  it('rejects when below the minimum order amount', async () => {
    prisma.coupon.findUnique.mockResolvedValue(makeCoupon({ minOrderAmount: 100 }));
    await expect(service.validate('SAVE10', 50)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an inactive coupon', async () => {
    prisma.coupon.findUnique.mockResolvedValue(makeCoupon({ isActive: false }));
    await expect(service.validate('SAVE10', 100)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when the usage limit is reached', async () => {
    prisma.coupon.findUnique.mockResolvedValue(makeCoupon({ maxUses: 5, usedCount: 5 }));
    await expect(service.validate('SAVE10', 100)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an expired coupon', async () => {
    prisma.coupon.findUnique.mockResolvedValue(
      makeCoupon({ validUntil: new Date('2000-01-01') }),
    );
    await expect(service.validate('SAVE10', 100)).rejects.toBeInstanceOf(BadRequestException);
  });
});
