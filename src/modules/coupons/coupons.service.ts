import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Coupon, CouponType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { round2, toNumber } from '../../common/utils/money.util';
import { CreateCouponDto } from './dto/coupon.dto';

export interface CouponApplication {
  coupon: Coupon;
  discount: number;
  freeShipping: boolean;
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCouponDto) {
    return this.prisma.coupon.create({
      data: {
        code: dto.code.toUpperCase(),
        type: dto.type,
        value: dto.value,
        minOrderAmount: dto.minOrderAmount ?? 0,
        maxDiscountAmount: dto.maxDiscountAmount ?? null,
        maxUses: dto.maxUses ?? null,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        isActive: dto.isActive ?? true,
        applicableProducts: dto.applicableProducts ?? [],
        applicableCategories: dto.applicableCategories ?? [],
      },
    });
  }

  findAll() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  /**
   * Validate a coupon against an order subtotal and (optionally) the product /
   * category ids in the cart. Returns the computed discount amount.
   */
  async validate(
    code: string,
    subtotal: number,
    context?: { productIds?: string[]; categoryIds?: string[] },
  ): Promise<CouponApplication> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon) throw new NotFoundException('Coupon not found');

    const now = new Date();
    if (!coupon.isActive) throw new BadRequestException('Coupon is not active');
    if (coupon.validFrom && coupon.validFrom > now)
      throw new BadRequestException('Coupon is not yet valid');
    if (coupon.validUntil && coupon.validUntil < now)
      throw new BadRequestException('Coupon has expired');
    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses)
      throw new BadRequestException('Coupon usage limit reached');
    if (subtotal < toNumber(coupon.minOrderAmount))
      throw new BadRequestException(
        `Order subtotal must be at least ${toNumber(coupon.minOrderAmount)} to use this coupon`,
      );

    if (coupon.applicableProducts.length && context?.productIds?.length) {
      const overlap = context.productIds.some((id) => coupon.applicableProducts.includes(id));
      if (!overlap) throw new BadRequestException('Coupon not applicable to items in cart');
    }
    if (coupon.applicableCategories.length && context?.categoryIds?.length) {
      const overlap = context.categoryIds.some((id) => coupon.applicableCategories.includes(id));
      if (!overlap) throw new BadRequestException('Coupon not applicable to items in cart');
    }

    return this.computeDiscount(coupon, subtotal);
  }

  private computeDiscount(coupon: Coupon, subtotal: number): CouponApplication {
    let discount = 0;
    let freeShipping = false;

    switch (coupon.type) {
      case CouponType.PERCENTAGE: {
        discount = round2((subtotal * toNumber(coupon.value)) / 100);
        const cap = coupon.maxDiscountAmount ? toNumber(coupon.maxDiscountAmount) : null;
        if (cap != null && discount > cap) discount = cap;
        break;
      }
      case CouponType.FIXED_AMOUNT:
        discount = Math.min(toNumber(coupon.value), subtotal);
        break;
      case CouponType.FREE_SHIPPING:
        freeShipping = true;
        break;
    }
    return { coupon, discount: round2(discount), freeShipping };
  }

  /** Increment usage counter after a successful order (idempotency at caller). */
  async consume(code: string, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    await db.coupon.update({
      where: { code: code.toUpperCase() },
      data: { usedCount: { increment: 1 } },
    });
  }
}
