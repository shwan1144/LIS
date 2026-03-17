"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var FileStorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileStorageService = void 0;
const common_1 = require("@nestjs/common");
const client_s3_1 = require("@aws-sdk/client-s3");
let FileStorageService = FileStorageService_1 = class FileStorageService {
    constructor() {
        this.logger = new common_1.Logger(FileStorageService_1.name);
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
        const clientConfig = {
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
        this.client = new client_s3_1.S3Client(clientConfig);
    }
    isConfigured() {
        return this.configured;
    }
    getClientOrThrow() {
        if (!this.client || !this.configured) {
            throw new Error('S3 storage is not configured. Set S3_ENDPOINT, S3_BUCKET_NAME, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.');
        }
        return this.client;
    }
    async uploadFile(key, body, contentType) {
        try {
            const client = this.getClientOrThrow();
            const command = new client_s3_1.PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: body,
                ContentType: contentType,
            });
            await client.send(command);
            return key;
        }
        catch (error) {
            this.logger.error(`Failed to upload file to S3 (${key}): ${error.message}`, error.stack);
            throw error;
        }
    }
    async deleteFile(key) {
        try {
            const client = this.getClientOrThrow();
            const command = new client_s3_1.DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });
            await client.send(command);
        }
        catch (error) {
            this.logger.error(`Failed to delete file from S3 (${key}): ${error.message}`);
        }
    }
    async getFile(key) {
        try {
            const client = this.getClientOrThrow();
            const command = new client_s3_1.GetObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });
            const response = await client.send(command);
            if (!response.Body) {
                throw new Error('Empty response body from S3');
            }
            const bytes = await response.Body.transformToByteArray();
            return Buffer.from(bytes);
        }
        catch (error) {
            this.logger.error(`Failed to fetch file from S3 (${key}): ${error.message}`);
            throw error;
        }
    }
};
exports.FileStorageService = FileStorageService;
exports.FileStorageService = FileStorageService = FileStorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], FileStorageService);
//# sourceMappingURL=file-storage.service.js.map