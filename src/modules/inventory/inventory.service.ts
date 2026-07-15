import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, StockChangeType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

/**
 * Central stock authority. Stock lives on ProductVariant.stockQuantity (source
 * of truth for availability) mirrored per-warehouse in the Inventory table.
 * Reservations hold stock between checkout and payment confirmation.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx): PrismaService | Tx {
    return tx ?? this.prisma;
  }

  /** Available = on-hand stock minus what is already reserved. */
  async getAvailable(variantId: string, tx?: Tx): Promise<number> {
    const variant = await this.db(tx).productVariant.findUnique({
      where: { id: variantId },
      include: { inventory: true },
    });
    if (!variant) throw new BadRequestException('Variant not found');
    const reserved = variant.inventory.reduce((sum, i) => sum + i.reserved, 0);
    return variant.stockQuantity - reserved;
  }

  async assertAvailable(variantId: string, quantity: number, tx?: Tx): Promise<void> {
    const available = await this.getAvailable(variantId, tx);
    if (available < quantity) {
      throw new BadRequestException(
        `Insufficient stock for variant ${variantId}: requested ${quantity}, available ${available}`,
      );
    }
  }

  /** Reserve stock (checkout). Increments Inventory.reserved. */
  async reserve(variantId: string, quantity: number, reference: string, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    await this.assertAvailable(variantId, quantity, tx);
    await this.upsertInventory(variantId, db);
    await db.inventory.updateMany({
      where: { variantId, warehouseId: 'default' },
      data: { reserved: { increment: quantity } },
    });
    await this.log(variantId, StockChangeType.RESERVATION, quantity, reference, db);
  }

  /** Release a reservation (payment failed / order canceled). */
  async release(variantId: string, quantity: number, reference: string, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    await db.inventory.updateMany({
      where: { variantId, warehouseId: 'default' },
      data: { reserved: { decrement: quantity } },
    });
    await this.log(variantId, StockChangeType.RELEASE, quantity, reference, db);
  }

  /** Convert a reservation into an actual deduction (payment succeeded). */
  async commit(variantId: string, quantity: number, reference: string, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    await db.productVariant.update({
      where: { id: variantId },
      data: { stockQuantity: { decrement: quantity } },
    });
    await db.inventory.updateMany({
      where: { variantId, warehouseId: 'default' },
      data: { quantity: { decrement: quantity }, reserved: { decrement: quantity } },
    });
    await this.log(variantId, StockChangeType.PURCHASE, quantity, reference, db);
  }

  /** Restore stock (refund). */
  async restore(variantId: string, quantity: number, reference: string, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    await db.productVariant.update({
      where: { id: variantId },
      data: { stockQuantity: { increment: quantity } },
    });
    await this.upsertInventory(variantId, db);
    await db.inventory.updateMany({
      where: { variantId, warehouseId: 'default' },
      data: { quantity: { increment: quantity } },
    });
    await this.log(variantId, StockChangeType.REFUND, quantity, reference, db);
  }

  async adjust(variantId: string, delta: number, reference: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.productVariant.update({
        where: { id: variantId },
        data: { stockQuantity: { increment: delta } },
      });
      await this.upsertInventory(variantId, tx);
      await tx.inventory.updateMany({
        where: { variantId, warehouseId: 'default' },
        data: { quantity: { increment: delta } },
      });
      await this.log(variantId, StockChangeType.ADJUSTMENT, delta, reference, tx);
    });
  }

  /** Variants at or below their reorder point (column-to-column compare). */
  async lowStock() {
    return this.prisma.$queryRaw<
      Array<{ id: string; sku: string; name: string; stock_quantity: number; reorder_point: number }>
    >`SELECT v.id, v.sku, p.name, v.stock_quantity, v.reorder_point
        FROM product_variants v
        JOIN products p ON p.id = v.product_id
        WHERE v.stock_quantity <= v.reorder_point
        ORDER BY v.stock_quantity ASC`;
  }

  private async upsertInventory(variantId: string, db: PrismaService | Tx): Promise<void> {
    const existing = await db.inventory.findFirst({ where: { variantId, warehouseId: 'default' } });
    if (!existing) {
      const variant = await db.productVariant.findUnique({ where: { id: variantId } });
      await db.inventory.create({
        data: { variantId, warehouseId: 'default', quantity: variant?.stockQuantity ?? 0, reserved: 0 },
      });
    }
  }

  private async log(
    variantId: string,
    type: StockChangeType,
    quantity: number,
    reference: string,
    db: PrismaService | Tx,
  ): Promise<void> {
    await db.stockHistory.create({ data: { variantId, type, quantity, reference } });
  }
}
