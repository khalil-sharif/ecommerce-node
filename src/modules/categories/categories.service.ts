import { Injectable, NotFoundException } from '@nestjs/common';
import { Category } from '@prisma/client';
import slugify from 'slugify';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate, PaginationDto } from '../../common/dto/pagination.dto';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

export interface CategoryNode extends Category {
  children: CategoryNode[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    const slug = await this.uniqueSlug(dto.name);
    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        parentId: dto.parentId ?? null,
        imageUrl: dto.imageUrl,
        position: dto.position ?? 0,
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.getById(id);
    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        parentId: dto.parentId === undefined ? undefined : dto.parentId,
        imageUrl: dto.imageUrl ?? undefined,
        position: dto.position ?? undefined,
        ...(dto.name ? { slug: await this.uniqueSlug(dto.name, id) } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.getById(id);
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }

  async getById(id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  /** Full category hierarchy as a nested tree. */
  async tree(): Promise<CategoryNode[]> {
    const all = await this.prisma.category.findMany({ orderBy: { position: 'asc' } });
    const byId = new Map<string, CategoryNode>();
    all.forEach((c) => byId.set(c.id, { ...c, children: [] }));
    const roots: CategoryNode[] = [];
    byId.forEach((node) => {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  /** Breadcrumb trail from root to the given category slug. */
  async breadcrumb(slug: string): Promise<Array<{ name: string; slug: string }>> {
    const category = await this.prisma.category.findUnique({ where: { slug } });
    if (!category) throw new NotFoundException('Category not found');
    const trail: Array<{ name: string; slug: string }> = [];
    let current: Category | null = category;
    while (current) {
      trail.unshift({ name: current.name, slug: current.slug });
      current = current.parentId
        ? await this.prisma.category.findUnique({ where: { id: current.parentId } })
        : null;
    }
    return trail;
  }

  async productsBySlug(slug: string, pagination: PaginationDto) {
    const category = await this.prisma.category.findUnique({ where: { slug } });
    if (!category) throw new NotFoundException('Category not found');

    // Include descendant categories so a parent lists its children's products.
    const descendantIds = await this.descendantIds(category.id);
    const where = { deletedAt: null, status: 'ACTIVE' as const, categoryId: { in: descendantIds } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: { images: { orderBy: { position: 'asc' } }, variants: true },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      category: { id: category.id, name: category.name, slug: category.slug },
      breadcrumb: await this.breadcrumb(slug),
      ...paginate(items, total, pagination.page, pagination.limit),
    };
  }

  private async descendantIds(rootId: string): Promise<string[]> {
    const all = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
    const childrenOf = new Map<string, string[]>();
    all.forEach((c) => {
      if (c.parentId) {
        childrenOf.set(c.parentId, [...(childrenOf.get(c.parentId) ?? []), c.id]);
      }
    });
    const ids: string[] = [];
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      ids.push(id);
      stack.push(...(childrenOf.get(id) ?? []));
    }
    return ids;
  }

  private async uniqueSlug(name: string, ignoreId?: string): Promise<string> {
    const base = slugify(name, { lower: true, strict: true });
    let slug = base;
    while (true) {
      const found = await this.prisma.category.findUnique({ where: { slug } });
      if (!found || found.id === ignoreId) break;
      slug = `${base}-${nanoid(5).toLowerCase()}`;
    }
    return slug;
  }
}
