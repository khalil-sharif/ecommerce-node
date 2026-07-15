import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const detailInclude = {
  category: true,
  variants: { orderBy: { createdAt: 'asc' } },
  images: { orderBy: { position: 'asc' } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ProductCreateInput) {
    return this.prisma.product.create({ data, include: detailInclude });
  }

  update(id: string, data: Prisma.ProductUpdateInput) {
    return this.prisma.product.update({ where: { id }, data, include: detailInclude });
  }

  findById(id: string) {
    return this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: detailInclude,
    });
  }

  findBySlug(slug: string) {
    return this.prisma.product.findFirst({
      where: { slug, deletedAt: null },
      include: detailInclude,
    });
  }

  softDelete(id: string) {
    return this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async paginate(where: Prisma.ProductWhereInput, orderBy: Prisma.ProductOrderByWithRelationInput, skip: number, take: number) {
    return this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: detailInclude, orderBy, skip, take }),
      this.prisma.product.count({ where }),
    ]);
  }
}
