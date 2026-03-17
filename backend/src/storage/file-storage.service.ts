import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly configured: boolean;

  constructor() {
    this.bucket = process.env.S3_BUCKET_NAME || '';
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const region = process.env.S3_REGION || 'auto';
    this.configured = Boolean(this.bucket && endpoint && accessKeyId && secretAccessKey);

    if (!this.configured) {
      this.logger.warn('S3 Storage is not fully configured. File uploads will fail.');
      this.client = null;
      return;
    }

    const clientConfig: S3ClientConfig = {
      region,
      forcePathStyle: true,
    };
    if (endpoint) {
      clientConfig.endpoint = endpoint;
    }
    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId,
        secretAccessKey,
      };
    }

    this.client = new S3Client(clientConfig);
  }

  isConfigured(): boolean {
    return this.configured;
  }

  private getClientOrThrow(): S3Client {
    if (!this.client || !this.configured) {
      throw new Error(
        'S3 storage is not configured. Set S3_ENDPOINT, S3_BUCKET_NAME, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.',
      );
    }
    return this.client;
  }

  async uploadFile(key: string, body: Buffer, contentType: string): Promise<string> {
    try {
      const client = this.getClientOrThrow();
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      });

      await client.send(command);
      return key;
    } catch (error) {
      this.logger.error(`Failed to upload file to S3 (${key}): ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      const client = this.getClientOrThrow();
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await client.send(command);
    } catch (error) {
      this.logger.error(`Failed to delete file from S3 (${key}): ${error.message}`);
    }
  }

  async getFile(key: string): Promise<Buffer> {
    try {
      const client = this.getClientOrThrow();
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await client.send(command);
      if (!response.Body) {
        throw new Error('Empty response body from S3');
      }

      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (error) {
      this.logger.error(`Failed to fetch file from S3 (${key}): ${error.message}`);
      throw error;
    }
  }
}
