import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES, JOBS } from '../queue.constants';

/**
 * Sends transactional emails. In production wire this to SES/SendGrid/etc;
 * here we log the payload so the flow is observable end-to-end.
 */
@Processor(QUEUES.EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOBS.ORDER_CONFIRMATION:
        this.logger.log(
          `📧 Order confirmation for ${job.data.orderNumber} → ${job.data.email ?? 'guest'}`,
        );
        break;
      case JOBS.SHIPPING_NOTIFICATION:
        this.logger.log(
          `📦 Shipping notification for ${job.data.orderNumber} (status: ${job.data.status})`,
        );
        break;
      case JOBS.LOW_STOCK_ALERT:
        this.logger.warn(
          `⚠️  Low stock: ${job.data.sku} at ${job.data.stockQuantity} (reorder ${job.data.reorderPoint})`,
        );
        break;
      default:
        this.logger.debug(`Unhandled email job: ${job.name}`);
    }
  }
}
