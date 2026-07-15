import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ElasticsearchService } from '../../modules/search/elasticsearch.service';
import { toNumber } from '../../common/utils/money.util';
import { QUEUES, JOBS } from '../queue.constants';

/**
 * Keeps Elasticsearch in sync with the product catalog.
 */
@Processor(QUEUES.SEARCH_INDEX)
export class SearchIndexProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchIndexProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly es: ElasticsearchService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === JOBS.REMOVE_PRODUCT) {
      await this.es.removeProduct(job.data.productId);
      return;
    }
    if (job.name !== JOBS.INDEX_PRODUCT) return;

    const product = await this.prisma.product.findUnique({
      where: { id: job.data.productId },
      include: { category: true, variants: true },
    });
    if (!product || product.deletedAt) {
      await this.es.removeProduct(job.data.productId);
      return;
    }

    const mergedAttributes = product.variants.reduce<Record<string, unknown>>((acc, v) => {
      Object.assign(acc, (v.attributes as Record<string, unknown>) ?? {});
      return acc;
    }, {});

    await this.es.indexProduct({
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      category: product.category?.name ?? null,
      categorySlug: product.category?.slug ?? null,
      brand: product.brand,
      price: toNumber(product.basePrice),
      attributes: mergedAttributes,
      rating: toNumber(product.averageRating),
      reviewCount: product.reviewCount,
      status: product.status,
      createdAt: product.createdAt.toISOString(),
    });
    this.logger.debug(`Indexed product ${product.slug}`);
  }
}
