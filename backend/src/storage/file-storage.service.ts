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
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET_NAME || '';
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const region = process.env.S3_REGION || 'auto';

    if (!this.bucket || !endpoint || !accessKeyId || !secretAccessKey) {
      this.logger.warn('S3 Storage is not fully configured. File uploads will fail.');
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

  async uploadFile(key: string, body: Buffer, contentType: string): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      });

      await this.client.send(command);
      return key;
    } catch (error) {
      this.logger.error(`Failed to upload file to S3 (${key}): ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
    } catch (error) {
      this.logger.error(`Failed to delete file from S3 (${key}): ${error.message}`);
    }
  }

  async getFile(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);
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
