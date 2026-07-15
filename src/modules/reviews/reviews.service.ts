import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate, PaginationDto } from '../../common/dto/pagination.dto';
import { round2 } from '../../common/utils/money.util';
import { QUEUES, JOBS } from '../../queue/queue.constants';
import { CreateReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.SEARCH_INDEX) private readonly indexQueue: Queue,
  ) {}

  async create(userId: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Product not found');

    const existing = await this.prisma.review.findUnique({
      where: { productId_userId: { productId: dto.productId, userId } },
    });
    if (existing) throw new ConflictException('You have already reviewed this product');

    const isVerified = await this.hasPurchased(userId, dto.productId);
    const review = await this.prisma.review.create({
      data: {
        productId: dto.productId,
        userId,
        rating: dto.rating,
        title: dto.title,
        body: dto.body,
        isVerified,
        isApproved: true,
      },
    });
    await this.recomputeProductRating(dto.productId);
    return review;
  }

  async listForProduct(productId: string, pagination: PaginationDto) {
    const where: Prisma.ReviewWhereInput = { productId, isApproved: true };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: [{ helpful: 'desc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.review.count({ where }),
    ]);
    return paginate(items, total, pagination.page, pagination.limit);
  }

  async setApproval(reviewId: string, isApproved: boolean) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { isApproved },
    });
    await this.recomputeProductRating(review.productId);
    return updated;
  }

  private async hasPurchased(userId: string, productId: string): Promise<boolean> {
    const count = await this.prisma.orderItem.count({
      where: {
        order: {
          userId,
          status: { in: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED] },
        },
        variant: { productId },
      },
    });
    return count > 0;
  }

  /** Recompute cached average_rating / review_count from approved reviews. */
  private async recomputeProductRating(productId: string): Promise<void> {
    const agg = await this.prisma.review.aggregate({
      where: { productId, isApproved: true },
      _avg: { rating: true },
      _count: true,
    });
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        averageRating: round2(agg._avg.rating ?? 0),
        reviewCount: agg._count,
      },
    });
    await this.indexQueue.add(JOBS.INDEX_PRODUCT, { productId });
  }
}
