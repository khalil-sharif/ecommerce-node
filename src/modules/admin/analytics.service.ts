import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toNumber } from '../../common/utils/money.util';

const REVENUE_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const [orderCount, revenueAgg, topProducts, topCategories, revenueByDay] = await Promise.all([
      this.prisma.order.count({ where: { status: { in: REVENUE_STATUSES } } }),
      this.prisma.order.aggregate({
        where: { status: { in: REVENUE_STATUSES } },
        _sum: { total: true },
        _avg: { total: true },
      }),
      this.topProducts(),
      this.topCategories(),
      this.revenueByPeriod('day'),
    ]);

    return {
      orders: orderCount,
      revenue: toNumber(revenueAgg._sum.total),
      averageOrderValue: toNumber(revenueAgg._avg.total),
      topProducts,
      topCategories,
      revenueByDay,
    };
  }

  /** Revenue grouped by day / week / month using date_trunc. */
  async revenueByPeriod(period: 'day' | 'week' | 'month') {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ bucket: Date; revenue: string; orders: bigint }>>(
      `SELECT date_trunc($1, created_at) AS bucket,
              SUM(total)::text AS revenue,
              COUNT(*) AS orders
         FROM orders
        WHERE status = ANY($2::text[]::"OrderStatus"[])
        GROUP BY bucket
        ORDER BY bucket DESC
        LIMIT 30`,
      period,
      REVENUE_STATUSES,
    );
    return rows.map((r) => ({
      period: r.bucket,
      revenue: toNumber(r.revenue),
      orders: Number(r.orders),
    }));
  }

  private async topProducts(limit = 10) {
    const rows = await this.prisma.orderItem.groupBy({
      by: ['productName'],
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: limit,
    });
    return rows.map((r) => ({
      product: r.productName,
      unitsSold: r._sum.quantity ?? 0,
      revenue: toNumber(r._sum.total),
    }));
  }

  private async topCategories(limit = 10) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ name: string; revenue: string; units: bigint }>>(
      `SELECT c.name,
              SUM(oi.total)::text AS revenue,
              SUM(oi.quantity) AS units
         FROM order_items oi
         JOIN product_variants v ON v.id = oi.product_variant_id
         JOIN products p ON p.id = v.product_id
         JOIN categories c ON c.id = p.category_id
        GROUP BY c.name
        ORDER BY revenue DESC
        LIMIT $1`,
      limit,
    );
    return rows.map((r) => ({ category: r.name, unitsSold: Number(r.units), revenue: toNumber(r.revenue) }));
  }

  async inventoryOverview() {
    const [totalVariants, outOfStock, lowStock] = await Promise.all([
      this.prisma.productVariant.count(),
      this.prisma.productVariant.count({ where: { stockQuantity: 0 } }),
      this.prisma.$queryRaw<Array<{ id: string; sku: string; name: string; stock_quantity: number; reorder_point: number }>>`
        SELECT v.id, v.sku, p.name, v.stock_quantity, v.reorder_point
          FROM product_variants v
          JOIN products p ON p.id = v.product_id
         WHERE v.stock_quantity <= v.reorder_point
         ORDER BY v.stock_quantity ASC`,
    ]);
    return { totalVariants, outOfStock, lowStockCount: lowStock.length, lowStock };
  }
}
