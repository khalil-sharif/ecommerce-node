import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';

export interface ProductDocument {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  category?: string | null;
  categorySlug?: string | null;
  brand?: string | null;
  price: number;
  attributes: Record<string, unknown>;
  rating: number;
  reviewCount: number;
  status: string;
  createdAt: string;
}

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchService.name);
  private readonly client: Client;
  readonly index: string;

  constructor(private readonly config: ConfigService) {
    this.index = config.get<string>('elasticsearch.productIndex')!;
    const username = config.get<string>('elasticsearch.username');
    const password = config.get<string>('elasticsearch.password');
    this.client = new Client({
      node: config.get<string>('elasticsearch.node'),
      auth: username && password ? { username, password } : undefined,
    });
  }

  get raw(): Client {
    return this.client;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureIndex();
    } catch (err) {
      this.logger.warn(`Elasticsearch not reachable at init: ${(err as Error).message}`);
    }
  }

  async ensureIndex(): Promise<void> {
    const exists = await this.client.indices.exists({ index: this.index });
    if (exists) return;
    await this.client.indices.create({
      index: this.index,
      settings: {
        analysis: {
          analyzer: {
            autocomplete: {
              type: 'custom',
              tokenizer: 'standard',
              filter: ['lowercase', 'autocomplete_filter'],
            },
          },
          filter: {
            autocomplete_filter: { type: 'edge_ngram', min_gram: 2, max_gram: 20 },
          },
        },
      },
      mappings: {
        properties: {
          name: { type: 'text', analyzer: 'autocomplete', search_analyzer: 'standard' },
          description: { type: 'text' },
          category: { type: 'keyword' },
          categorySlug: { type: 'keyword' },
          brand: { type: 'keyword' },
          price: { type: 'float' },
          rating: { type: 'float' },
          reviewCount: { type: 'integer' },
          status: { type: 'keyword' },
          createdAt: { type: 'date' },
          attributes: { type: 'object', enabled: true },
        },
      },
    });
    this.logger.log(`Created Elasticsearch index "${this.index}"`);
  }

  async indexProduct(doc: ProductDocument): Promise<void> {
    await this.client.index({ index: this.index, id: doc.id, document: doc, refresh: true });
  }

  async removeProduct(id: string): Promise<void> {
    try {
      await this.client.delete({ index: this.index, id, refresh: true });
    } catch (err) {
      if ((err as any)?.meta?.statusCode !== 404) throw err;
    }
  }

  async search(body: Record<string, unknown>) {
    return this.client.search({ index: this.index, ...body });
  }
}
