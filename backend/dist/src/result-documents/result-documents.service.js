"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResultDocumentsService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
let ResultDocumentsService = class ResultDocumentsService {
    constructor() {
        this.storageDir = this.resolveStorageDir();
        this.maxBytes = this.resolveMaxBytes();
    }
    getMaxBytes() {
        return this.maxBytes;
    }
    async savePdf(params) {
        this.assertPdfUpload(params.originalName, params.mimeType ?? null, params.buffer.length);
        const fileName = this.normalizeFileName(params.originalName);
        const safeExtension = (0, path_1.extname)(fileName).toLowerCase() || '.pdf';
        const storageKey = (0, path_1.join)(params.labId, params.orderTestId, `${Date.now()}-${(0, crypto_1.randomUUID)()}${safeExtension}`);
        const targetPath = this.resolvePath(storageKey);
        await fs_1.promises.mkdir((0, path_1.dirname)(targetPath), { recursive: true });
        await fs_1.promises.writeFile(targetPath, params.buffer);
        if (params.previousStorageKey?.trim()) {
            await this.deleteDocument(params.previousStorageKey).catch(() => undefined);
        }
        return {
            storageKey,
            fileName,
            mimeType: 'application/pdf',
            sizeBytes: params.buffer.length,
        };
    }
    async deleteDocument(storageKey) {
        const normalizedKey = String(storageKey ?? '').trim();
        if (!normalizedKey)
            return;
        const targetPath = this.resolvePath(normalizedKey);
        await fs_1.promises.rm(targetPath, { force: true }).catch(() => undefined);
    }
    async readDocument(storageKey) {
        const normalizedKey = String(storageKey ?? '').trim();
        if (!normalizedKey) {
            throw new common_1.NotFoundException('Result document not found');
        }
        const targetPath = this.resolvePath(normalizedKey);
        try {
            return await fs_1.promises.readFile(targetPath);
        }
        catch (error) {
            if (error?.code === 'ENOENT') {
                throw new common_1.NotFoundException('Result document file is missing');
            }
            throw new common_1.InternalServerErrorException('Failed to read result document');
        }
    }
    resolveStorageDir() {
        const configured = String(process.env.RESULT_PDF_STORAGE_DIR ?? '').trim();
        if (configured) {
            return (0, path_1.normalize)(configured);
        }
        return (0, path_1.join)(process.cwd(), 'storage', 'result-documents');
    }
    resolveMaxBytes() {
        const raw = Number.parseInt(process.env.RESULT_PDF_MAX_BYTES ?? '20971520', 10);
        return Number.isFinite(raw) && raw > 0 ? raw : 20 * 1024 * 1024;
    }
    assertPdfUpload(originalName, mimeType, sizeBytes) {
        if (!sizeBytes || sizeBytes <= 0) {
            throw new common_1.BadRequestException('Uploaded result document is empty');
        }
        if (sizeBytes > this.maxBytes) {
            throw new common_1.BadRequestException(`Uploaded result document exceeds the ${this.maxBytes} byte limit`);
        }
        const normalizedMime = String(mimeType ?? '').trim().toLowerCase();
        const normalizedName = String(originalName ?? '').trim().toLowerCase();
        const hasPdfMime = normalizedMime === 'application/pdf' || normalizedMime === 'application/x-pdf';
        const hasPdfExtension = normalizedName.endsWith('.pdf');
        if (!hasPdfMime && !hasPdfExtension) {
            throw new common_1.BadRequestException('Only PDF result documents are allowed');
        }
    }
    normalizeFileName(originalName) {
        const trimmed = (0, path_1.basename)(String(originalName ?? '').trim() || 'result.pdf');
        const collapsed = trimmed.replace(/[^\w.\- ]+/g, '_').trim();
        const withExtension = collapsed.toLowerCase().endsWith('.pdf')
            ? collapsed
            : `${collapsed || 'result'}.pdf`;
        return withExtension.slice(0, 255);
    }
    resolvePath(storageKey) {
        const normalizedKey = (0, path_1.normalize)(storageKey).replace(/^([/\\])+/, '');
        const fullPath = (0, path_1.join)(this.storageDir, normalizedKey);
        const relativePath = (0, path_1.relative)(this.storageDir, fullPath);
        if (relativePath.startsWith('..') || (0, path_1.isAbsolute)(relativePath)) {
            throw new common_1.InternalServerErrorException('Invalid result document storage path');
        }
        return fullPath;
    }
};
exports.ResultDocumentsService = ResultDocumentsService;
exports.ResultDocumentsService = ResultDocumentsService = __decorate([
    (0, common_1.Injectable)()
], ResultDocumentsService);
//# sourceMappingURL=result-documents.service.js.map