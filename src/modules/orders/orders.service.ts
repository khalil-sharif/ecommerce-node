import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Order, OrderStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { QUEUES, JOBS } from '../../queue/queue.constants';
import { paginate } from '../../common/dto/pagination.dto';
import { canTransition } from './order-status.util';
import { OrderQueryDto } from './dto/order-query.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    @InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue,
  ) {}

  async listForUser(userId: string, query: OrderQueryDto) {
    const where: Prisma.OrderWhereInput = { userId, ...this.dateFilter(query), ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async listAll(query: OrderQueryDto) {
    const where: Prisma.OrderWhereInput = { ...this.dateFilter(query), ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: { items: true, user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async getById(id: string, userId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (userId && order.userId !== userId) throw new ForbiddenException('Not your order');
    return order;
  }

  /** User-initiated cancel (only before fulfilment). Releases reserved stock. */
  async cancel(id: string, userId: string) {
    const order = await this.getById(id, userId);
    const cancelable: OrderStatus[] = [OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED];
    if (!cancelable.includes(order.status)) {
      throw new BadRequestException(`Cannot cancel an order in status ${order.status}`);
    }
    return this.transition(order, OrderStatus.CANCELED, { releaseStock: true });
  }

  /** Admin status update with lifecycle validation. */
  async updateStatus(id: string, status: OrderStatus) {
    const order = await this.getById(id);
    if (!canTransition(order.status, status)) {
      throw new BadRequestException(`Illegal transition ${order.status} → ${status}`);
    }
    const releaseStock = status === OrderStatus.CANCELED;
    return this.transition(order, status, { releaseStock });
  }

  /**
   * Apply a status change, optionally releasing reserved stock, and enqueue the
   * matching notification.
   */
  async transition(
    order: Order,
    status: OrderStatus,
    opts: { releaseStock?: boolean } = {},
  ): Promise<Order> {
    const updated = await this.prisma.$transaction(async (tx) => {
      if (opts.releaseStock && order.status === OrderStatus.PENDING_PAYMENT) {
        const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
        for (const item of items) {
          await this.inventory.release(item.productVariantId, item.quantity, order.orderNumber, tx);
        }
      }
      return tx.order.update({ where: { id: order.id }, data: { status } });
    });

    if (status === OrderStatus.SHIPPED) {
      await this.emailQueue.add(JOBS.SHIPPING_NOTIFICATION, {
        orderNumber: order.orderNumber,
        status,
      });
    }
    return updated;
  }

  private dateFilter(query: OrderQueryDto): Prisma.OrderWhereInput {
    if (!query.from && !query.to) return {};
    return {
      createdAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      },
    };
  }
}
