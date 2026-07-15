import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES, JOBS } from '../queue.constants';

/**
 * Hourly low-stock sweep. Any variant at or below its reorder point queues a
 * low-stock alert email.
 */
@Processor(QUEUES.INVENTORY)
export class InventoryProcessor extends WorkerHost {
  private readonly logger = new Logger(InventoryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== JOBS.LOW_STOCK_ALERT) return;

    const variants = await this.prisma.$queryRaw<
      Array<{ id: string; sku: string; stock_quantity: number; reorder_point: number }>
    >`SELECT id, sku, stock_quantity, reorder_point FROM product_variants
        WHERE stock_quantity <= reorder_point`;

    for (const v of variants) {
      await this.emailQueue.add(JOBS.LOW_STOCK_ALERT, {
        sku: v.sku,
        stockQuantity: v.stock_quantity,
        reorderPoint: v.reorder_point,
      });
    }
    this.logger.log(`Low-stock sweep flagged ${variants.length} variant(s)`);
  }
}
