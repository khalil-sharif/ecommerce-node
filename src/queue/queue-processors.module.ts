import { Module } from '@nestjs/common';
import { EmailProcessor } from './processors/email.processor';
import { InventoryProcessor } from './processors/inventory.processor';
import { CartCleanupProcessor } from './processors/cart-cleanup.processor';
import { SearchIndexProcessor } from './processors/search-index.processor';
import { QueueSchedulerService } from './queue-scheduler.service';

/**
 * Registers all BullMQ workers plus the cron scheduler that enqueues the
 * recurring low-stock and cart-cleanup jobs.
 */
@Module({
  providers: [
    EmailProcessor,
    InventoryProcessor,
    CartCleanupProcessor,
    SearchIndexProcessor,
    QueueSchedulerService,
  ],
})
export class QueueProcessorsModule {}
