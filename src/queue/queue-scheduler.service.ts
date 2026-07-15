import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUES, JOBS } from './queue.constants';

/**
 * Registers repeatable jobs: hourly low-stock sweep and hourly cart cleanup.
 */
@Injectable()
export class QueueSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(QueueSchedulerService.name);

  constructor(
    @InjectQueue(QUEUES.INVENTORY) private readonly inventoryQueue: Queue,
    @InjectQueue(QUEUES.CART_CLEANUP) private readonly cartCleanupQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.inventoryQueue.add(
        JOBS.LOW_STOCK_ALERT,
        {},
        { repeat: { pattern: '0 * * * *' }, jobId: 'low-stock-hourly' },
      );
      await this.cartCleanupQueue.add(
        JOBS.EXPIRE_CARTS,
        {},
        { repeat: { pattern: '15 * * * *' }, jobId: 'cart-cleanup-hourly' },
      );
      this.logger.log('Registered repeatable maintenance jobs');
    } catch (err) {
      this.logger.warn(`Could not register repeatable jobs: ${(err as Error).message}`);
    }
  }
}
