import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES, JOBS } from '../queue.constants';

/**
 * Removes expired guest carts (expires_at in the past).
 */
@Processor(QUEUES.CART_CLEANUP)
export class CartCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(CartCleanupProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== JOBS.EXPIRE_CARTS) return;
    const { count } = await this.prisma.cart.deleteMany({
      where: { userId: null, expiresAt: { lt: new Date() } },
    });
    this.logger.log(`Cart cleanup removed ${count} expired guest cart(s)`);
  }
}
