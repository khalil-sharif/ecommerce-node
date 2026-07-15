import { BadRequestException } from '@nestjs/common';
import { StockChangeType } from '@prisma/client';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      productVariant: { findUnique: jest.fn(), update: jest.fn() },
      inventory: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
      stockHistory: { create: jest.fn() },
    };
    service = new InventoryService(prisma);
  });

  describe('getAvailable', () => {
    it('subtracts reserved from on-hand stock', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({
        id: 'v1',
        stockQuantity: 20,
        inventory: [{ reserved: 5 }, { reserved: 3 }],
      });
      await expect(service.getAvailable('v1')).resolves.toBe(12);
    });

    it('throws when the variant is missing', async () => {
      prisma.productVariant.findUnique.mockResolvedValue(null);
      await expect(service.getAvailable('nope')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('assertAvailable', () => {
    it('passes when enough stock is available', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({
        id: 'v1',
        stockQuantity: 10,
        inventory: [],
      });
      await expect(service.assertAvailable('v1', 10)).resolves.toBeUndefined();
    });

    it('throws when requesting more than available', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({
        id: 'v1',
        stockQuantity: 10,
        inventory: [{ reserved: 6 }],
      });
      await expect(service.assertAvailable('v1', 5)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('reserve', () => {
    it('increments reserved and logs a reservation', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({
        id: 'v1',
        stockQuantity: 10,
        inventory: [{ reserved: 0 }],
      });
      prisma.inventory.findFirst.mockResolvedValue({ id: 'i1' });

      await service.reserve('v1', 3, 'ORD-1');

      expect(prisma.inventory.updateMany).toHaveBeenCalledWith({
        where: { variantId: 'v1', warehouseId: 'default' },
        data: { reserved: { increment: 3 } },
      });
      expect(prisma.stockHistory.create).toHaveBeenCalledWith({
        data: { variantId: 'v1', type: StockChangeType.RESERVATION, quantity: 3, reference: 'ORD-1' },
      });
    });
  });

  describe('commit', () => {
    it('decrements both on-hand stock and reservation', async () => {
      await service.commit('v1', 2, 'ORD-1');
      expect(prisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { stockQuantity: { decrement: 2 } },
      });
      expect(prisma.inventory.updateMany).toHaveBeenCalledWith({
        where: { variantId: 'v1', warehouseId: 'default' },
        data: { quantity: { decrement: 2 }, reserved: { decrement: 2 } },
      });
    });
  });
});
