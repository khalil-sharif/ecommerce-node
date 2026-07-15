import { Injectable, Logger } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';
import { SearchQueryDto, SearchSort } from './dto/search-query.dto';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly es: ElasticsearchService) {}

  async search(query: SearchQueryDto) {
    const filters: Record<string, unknown>[] = [{ term: { status: 'ACTIVE' } }];

    if (query.category) filters.push({ term: { categorySlug: query.category } });
    if (query.brand) filters.push({ term: { brand: query.brand } });
    if (query.minPrice != null || query.maxPrice != null) {
      filters.push({
        range: {
          price: {
            ...(query.minPrice != null ? { gte: query.minPrice } : {}),
            ...(query.maxPrice != null ? { lte: query.maxPrice } : {}),
          },
        },
      });
    }
    if (query.minRating != null) filters.push({ range: { rating: { gte: query.minRating } } });

    const must = query.q
      ? [
          {
            multi_match: {
              query: query.q,
              fields: ['name^3', 'description', 'brand^2'],
              fuzziness: 'AUTO',
            },
          },
        ]
      : [{ match_all: {} }];

    const body = {
      from: (query.page - 1) * query.limit,
      size: query.limit,
      query: { bool: { must, filter: filters } },
      sort: this.buildSort(query.sort),
      aggs: {
        brands: { terms: { field: 'brand', size: 20 } },
        categories: { terms: { field: 'category', size: 20 } },
        avg_rating: { avg: { field: 'rating' } },
        price_ranges: {
          range: {
            field: 'price',
            ranges: [
              { to: 25 },
              { from: 25, to: 50 },
              { from: 50, to: 100 },
              { from: 100, to: 250 },
              { from: 250 },
            ],
          },
        },
      },
    };

    try {
      const res: any = await this.es.search(body);
      return this.formatResults(res, query);
    } catch (err) {
      this.logger.error(`Search failed: ${(err as Error).message}`);
      return {
        items: [],
        facets: { brands: [], categories: [], priceRanges: [] },
        meta: { total: 0, page: query.page, limit: query.limit, totalPages: 0 },
      };
    }
  }

  async autocomplete(prefix: string) {
    if (!prefix?.trim()) return { suggestions: [] };
    try {
      const res: any = await this.es.search({
        size: 8,
        _source: ['name', 'slug'],
        query: { match: { name: { query: prefix, operator: 'and' } } },
      });
      return {
        suggestions: res.hits.hits.map((h: any) => ({ name: h._source.name, slug: h._source.slug })),
      };
    } catch {
      return { suggestions: [] };
    }
  }

  private buildSort(sort: SearchSort): Array<string | Record<string, unknown>> {
    switch (sort) {
      case SearchSort.PRICE_ASC:
        return [{ price: 'asc' }];
      case SearchSort.PRICE_DESC:
        return [{ price: 'desc' }];
      case SearchSort.NEWEST:
        return [{ createdAt: 'desc' }];
      case SearchSort.RATING:
        return [{ rating: 'desc' }];
      default:
        return ['_score'];
    }
  }

  private formatResults(res: any, query: SearchQueryDto) {
    const total = res.hits.total?.value ?? res.hits.total ?? 0;
    return {
      items: res.hits.hits.map((h: any) => ({ id: h._id, score: h._score, ...h._source })),
      facets: {
        brands: (res.aggregations?.brands?.buckets ?? []).map((b: any) => ({
          value: b.key,
          count: b.doc_count,
        })),
        categories: (res.aggregations?.categories?.buckets ?? []).map((b: any) => ({
          value: b.key,
          count: b.doc_count,
        })),
        priceRanges: (res.aggregations?.price_ranges?.buckets ?? []).map((b: any) => ({
          from: b.from ?? null,
          to: b.to ?? null,
          count: b.doc_count,
        })),
        averageRating: res.aggregations?.avg_rating?.value ?? null,
      },
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit) || 0,
      },
    };
  }
}
