import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import slugify from 'slugify';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsRepository } from './products.repository';
import { QUEUES, JOBS } from '../../queue/queue.constants';
import { paginate } from '../../common/dto/pagination.dto';
import { CreateProductDto, ProductQueryDto, UpdateProductDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ProductsRepository,
    @InjectQueue(QUEUES.SEARCH_INDEX) private readonly indexQueue: Queue,
  ) {}

  async create(dto: CreateProductDto) {
    const slug = await this.uniqueSlug(dto.name);
    const product = await this.repo.create({
      name: dto.name,
      slug,
      description: dto.description,
      sku: dto.sku,
      basePrice: dto.basePrice,
      compareAtPrice: dto.compareAtPrice ?? null,
      currency: dto.currency ?? 'usd',
      status: dto.status ?? ProductStatus.DRAFT,
      brand: dto.brand,
      weight: dto.weight ?? null,
      dimensionsJson: (dto.dimensions as Prisma.InputJsonValue) ?? undefined,
      ...(dto.categoryId ? { category: { connect: { id: dto.categoryId } } } : {}),
      variants: dto.variants?.length
        ? {
            create: dto.variants.map((v) => ({
              name: v.name,
              sku: v.sku,
              priceOverride: v.priceOverride ?? null,
              stockQuantity: v.stockQuantity ?? 0,
              reorderPoint: v.reorderPoint ?? 10,
              attributes: (v.attributes as Prisma.InputJsonValue) ?? undefined,
            })),
          }
        : undefined,
      images: dto.images?.length
        ? { create: dto.images.map((i, idx) => ({ url: i.url, alt: i.alt, position: i.position ?? idx })) }
        : undefined,
    });
    await this.enqueueIndex(product.id);
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Product not found');

    const data: Prisma.ProductUpdateInput = {
      name: dto.name ?? undefined,
      description: dto.description ?? undefined,
      sku: dto.sku ?? undefined,
      basePrice: dto.basePrice ?? undefined,
      compareAtPrice: dto.compareAtPrice ?? undefined,
      currency: dto.currency ?? undefined,
      status: dto.status ?? undefined,
      brand: dto.brand ?? undefined,
      weight: dto.weight ?? undefined,
      dimensionsJson: (dto.dimensions as Prisma.InputJsonValue) ?? undefined,
      ...(dto.categoryId ? { category: { connect: { id: dto.categoryId } } } : {}),
    };
    if (dto.name && dto.name !== existing.name) {
      data.slug = await this.uniqueSlug(dto.name);
    }
    const product = await this.repo.update(id, data);
    await this.enqueueIndex(product.id);
    return product;
  }

  async remove(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Product not found');
    await this.repo.softDelete(id);
    await this.indexQueue.add(JOBS.REMOVE_PRODUCT, { productId: id });
    return { deleted: true };
  }

  async addImage(productId: string, image: { url: string; alt?: string }) {
    await this.findById(productId);
    const count = await this.prisma.productImage.count({ where: { productId } });
    const created = await this.prisma.productImage.create({
      data: { productId, url: image.url, alt: image.alt, position: count },
    });
    await this.enqueueIndex(productId);
    return created;
  }

  async findBySlug(slug: string) {
    const product = await this.repo.findBySlug(slug);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async findById(id: string) {
    const product = await this.repo.findById(id);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async list(query: ProductQueryDto, opts: { includeAllStatuses?: boolean } = {}) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(opts.includeAllStatuses ? {} : { status: ProductStatus.ACTIVE }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.brand ? { brand: query.brand } : {}),
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.minPrice != null || query.maxPrice != null
        ? {
            basePrice: {
              ...(query.minPrice != null ? { gte: query.minPrice } : {}),
              ...(query.maxPrice != null ? { lte: query.maxPrice } : {}),
            },
          }
        : {}),
    };
    const orderBy = this.orderBy(query.sort);
    const [items, total] = await this.repo.paginate(where, orderBy, query.skip, query.limit);
    return paginate(items, total, query.page, query.limit);
  }

  private orderBy(sort?: string): Prisma.ProductOrderByWithRelationInput {
    switch (sort) {
      case 'price_asc':
        return { basePrice: 'asc' };
      case 'price_desc':
        return { basePrice: 'desc' };
      default:
        return { createdAt: 'desc' };
    }
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name, { lower: true, strict: true });
    let slug = base;
    while (await this.prisma.product.findUnique({ where: { slug } })) {
      slug = `${base}-${nanoid(6).toLowerCase()}`;
    }
    return slug;
  }

  private async enqueueIndex(productId: string): Promise<void> {
    await this.indexQueue.add(JOBS.INDEX_PRODUCT, { productId });
  }
}
