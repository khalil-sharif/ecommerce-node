import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cart, CartItem, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { round2, toNumber } from '../../common/utils/money.util';

export interface CartContext {
  userId?: string;
  sessionId?: string;
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly config: ConfigService,
  ) {}

  /** Resolve (or lazily create) the active cart for a user or guest session. */
  async resolveCart(ctx: CartContext, createIfMissing = true): Promise<Cart> {
    let cart: Cart | null = null;
    if (ctx.userId) {
      cart = await this.prisma.cart.findFirst({ where: { userId: ctx.userId } });
    } else if (ctx.sessionId) {
      cart = await this.prisma.cart.findFirst({ where: { sessionId: ctx.sessionId, userId: null } });
    }
    if (cart || !createIfMissing) {
      if (!cart) throw new NotFoundException('Cart not found');
      return cart;
    }

    const ttlDays = this.config.get<number>('commerce.guestCartTtlDays')!;
    const expiresAt = ctx.userId ? null : new Date(Date.now() + ttlDays * 86400_000);
    return this.prisma.cart.create({
      data: { userId: ctx.userId ?? null, sessionId: ctx.userId ? null : ctx.sessionId, expiresAt },
    });
  }

  async getCart(ctx: CartContext) {
    const cart = await this.resolveCart(ctx);
    return this.buildCartView(cart.id);
  }

  async addItem(ctx: CartContext, variantId: string, quantity: number) {
    const cart = await this.resolveCart(ctx);
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true },
    });
    if (!variant || variant.product.deletedAt) throw new NotFoundException('Variant not found');

    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId: variantId } },
    });
    const targetQty = (existing?.quantity ?? 0) + quantity;
    await this.inventory.assertAvailable(variantId, targetQty);

    const unitPrice = this.unitPrice(variant.priceOverride, variant.product.basePrice);
    await this.prisma.cartItem.upsert({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId: variantId } },
      create: {
        cartId: cart.id,
        productVariantId: variantId,
        quantity,
        priceAtAdd: unitPrice,
      },
      update: { quantity: targetQty, priceAtAdd: unitPrice },
    });
    return this.buildCartView(cart.id);
  }

  async updateItem(ctx: CartContext, itemId: string, quantity: number) {
    const cart = await this.resolveCart(ctx);
    const item = await this.getOwnedItem(cart.id, itemId);
    await this.inventory.assertAvailable(item.productVariantId, quantity);
    await this.prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
    return this.buildCartView(cart.id);
  }

  async removeItem(ctx: CartContext, itemId: string) {
    const cart = await this.resolveCart(ctx);
    const item = await this.getOwnedItem(cart.id, itemId);
    await this.prisma.cartItem.delete({ where: { id: item.id } });
    return this.buildCartView(cart.id);
  }

  async clear(ctx: CartContext) {
    const cart = await this.resolveCart(ctx);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.buildCartView(cart.id);
  }

  /** Merge a guest cart into the authenticated user's cart on login. */
  async mergeGuestCart(userId: string, sessionId: string): Promise<void> {
    const guestCart = await this.prisma.cart.findFirst({
      where: { sessionId, userId: null },
      include: { items: true },
    });
    if (!guestCart || guestCart.items.length === 0) return;

    const userCart = await this.resolveCart({ userId });
    for (const item of guestCart.items) {
      const existing = await this.prisma.cartItem.findUnique({
        where: {
          cartId_productVariantId: { cartId: userCart.id, productVariantId: item.productVariantId },
        },
      });
      await this.prisma.cartItem.upsert({
        where: {
          cartId_productVariantId: { cartId: userCart.id, productVariantId: item.productVariantId },
        },
        create: {
          cartId: userCart.id,
          productVariantId: item.productVariantId,
          quantity: item.quantity,
          priceAtAdd: item.priceAtAdd,
        },
        update: { quantity: (existing?.quantity ?? 0) + item.quantity },
      });
    }
    await this.prisma.cart.delete({ where: { id: guestCart.id } });
  }

  private async getOwnedItem(cartId: string, itemId: string): Promise<CartItem> {
    const item = await this.prisma.cartItem.findUnique({ where: { id: itemId } });
    if (!item || item.cartId !== cartId) throw new NotFoundException('Cart item not found');
    return item;
  }

  private unitPrice(override: Prisma.Decimal | null, base: Prisma.Decimal): number {
    return toNumber(override ?? base);
  }

  /** Recompute totals from live prices on every read. */
  async buildCartView(cartId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: {
        items: {
          include: {
            variant: { include: { product: { include: { images: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!cart) throw new NotFoundException('Cart not found');

    const items = cart.items.map((item) => {
      const unitPrice = this.unitPrice(item.variant.priceOverride, item.variant.product.basePrice);
      return {
        id: item.id,
        variantId: item.productVariantId,
        productId: item.variant.productId,
        name: item.variant.product.name,
        variantName: item.variant.name,
        sku: item.variant.sku,
        image: item.variant.product.images[0]?.url ?? null,
        unitPrice,
        quantity: item.quantity,
        lineTotal: round2(unitPrice * item.quantity),
      };
    });

    const subtotal = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));
    return {
      id: cart.id,
      items,
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
      subtotal,
    };
  }
}
