import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { randomUUID } from 'crypto';

/**
 * Thin wrapper around MinIO (S3-compatible) for product image uploads.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: MinioClient;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get<string>('minio.bucket')!;
    this.publicUrl = config.get<string>('minio.publicUrl')!;
    this.client = new MinioClient({
      endPoint: config.get<string>('minio.endpoint')!,
      port: config.get<number>('minio.port'),
      useSSL: config.get<boolean>('minio.useSSL')!,
      accessKey: config.get<string>('minio.accessKey')!,
      secretKey: config.get<string>('minio.secretKey')!,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket, 'us-east-1');
        await this.setPublicReadPolicy();
        this.logger.log(`Created bucket "${this.bucket}"`);
      }
    } catch (err) {
      this.logger.warn(`MinIO not reachable at init: ${(err as Error).message}`);
    }
  }

  async uploadImage(
    buffer: Buffer,
    originalName: string,
    mimetype: string,
  ): Promise<{ url: string; key: string }> {
    const ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';
    const key = `${randomUUID()}.${ext}`;
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': mimetype,
    });
    return { url: `${this.publicUrl}/${this.bucket}/${key}`, key };
  }

  async deleteImage(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  private async setPublicReadPolicy(): Promise<void> {
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.bucket}/*`],
        },
      ],
    };
    await this.client.setBucketPolicy(this.bucket, JSON.stringify(policy));
  }
}
