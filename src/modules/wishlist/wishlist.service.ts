import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toNumber } from '../../common/utils/money.util';

const MAX_ITEMS = 100;

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async add(userId: string, variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Variant not found');

    const count = await this.prisma.wishlist.count({ where: { userId } });
    if (count >= MAX_ITEMS) throw new BadRequestException(`Wishlist limit of ${MAX_ITEMS} reached`);

    return this.prisma.wishlist.upsert({
      where: { userId_variantId: { userId, variantId } },
      create: { userId, variantId },
      update: {},
    });
  }

  async list(userId: string) {
    const rows = await this.prisma.wishlist.findMany({
      where: { userId },
      include: {
        variant: { include: { product: { include: { images: { orderBy: { position: 'asc' } } } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((w) => ({
      id: w.id,
      variantId: w.variantId,
      productId: w.variant.productId,
      name: w.variant.product.name,
      variantName: w.variant.name,
      slug: w.variant.product.slug,
      image: w.variant.product.images[0]?.url ?? null,
      price: toNumber(w.variant.priceOverride ?? w.variant.product.basePrice),
      inStock: w.variant.stockQuantity > 0,
    }));
  }

  async has(userId: string, variantId: string) {
    const found = await this.prisma.wishlist.findUnique({
      where: { userId_variantId: { userId, variantId } },
    });
    return { inWishlist: !!found };
  }

  async remove(userId: string, id: string) {
    const item = await this.prisma.wishlist.findUnique({ where: { id } });
    if (!item || item.userId !== userId) throw new NotFoundException('Wishlist item not found');
    await this.prisma.wishlist.delete({ where: { id } });
    return { removed: true };
  }
}
