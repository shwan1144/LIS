import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { basename, dirname, extname, isAbsolute, join, normalize, relative } from 'path';

type StoredResultDocument = {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

@Injectable()
export class ResultDocumentsService {
  private readonly storageDir = this.resolveStorageDir();
  private readonly maxBytes = this.resolveMaxBytes();

  getMaxBytes(): number {
    return this.maxBytes;
  }

  async savePdf(params: {
    labId: string;
    orderTestId: string;
    buffer: Buffer;
    originalName: string;
    mimeType?: string | null;
    previousStorageKey?: string | null;
  }): Promise<StoredResultDocument> {
    this.assertPdfUpload(params.originalName, params.mimeType ?? null, params.buffer.length);

    const fileName = this.normalizeFileName(params.originalName);
    const safeExtension = extname(fileName).toLowerCase() || '.pdf';
    const storageKey = join(
      params.labId,
      params.orderTestId,
      `${Date.now()}-${randomUUID()}${safeExtension}`,
    );
    const targetPath = this.resolvePath(storageKey);

    await fs.mkdir(dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, params.buffer);

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

  async deleteDocument(storageKey: string | null | undefined): Promise<void> {
    const normalizedKey = String(storageKey ?? '').trim();
    if (!normalizedKey) return;
    const targetPath = this.resolvePath(normalizedKey);
    await fs.rm(targetPath, { force: true }).catch(() => undefined);
  }

  async readDocument(storageKey: string | null | undefined): Promise<Buffer> {
    const normalizedKey = String(storageKey ?? '').trim();
    if (!normalizedKey) {
      throw new NotFoundException('Result document not found');
    }

    const targetPath = this.resolvePath(normalizedKey);
    try {
      return await fs.readFile(targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        throw new NotFoundException('Result document file is missing');
      }
      throw new InternalServerErrorException('Failed to read result document');
    }
  }

  private resolveStorageDir(): string {
    const configured = String(process.env.RESULT_PDF_STORAGE_DIR ?? '').trim();
    if (configured) {
      return normalize(configured);
    }
    return join(process.cwd(), 'storage', 'result-documents');
  }

  private resolveMaxBytes(): number {
    const raw = Number.parseInt(process.env.RESULT_PDF_MAX_BYTES ?? '20971520', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 20 * 1024 * 1024;
  }

  private assertPdfUpload(
    originalName: string,
    mimeType: string | null,
    sizeBytes: number,
  ): void {
    if (!sizeBytes || sizeBytes <= 0) {
      throw new BadRequestException('Uploaded result document is empty');
    }
    if (sizeBytes > this.maxBytes) {
      throw new BadRequestException(
        `Uploaded result document exceeds the ${this.maxBytes} byte limit`,
      );
    }

    const normalizedMime = String(mimeType ?? '').trim().toLowerCase();
    const normalizedName = String(originalName ?? '').trim().toLowerCase();
    const hasPdfMime =
      normalizedMime === 'application/pdf' || normalizedMime === 'application/x-pdf';
    const hasPdfExtension = normalizedName.endsWith('.pdf');

    if (!hasPdfMime && !hasPdfExtension) {
      throw new BadRequestException('Only PDF result documents are allowed');
    }
  }

  private normalizeFileName(originalName: string): string {
    const trimmed = basename(String(originalName ?? '').trim() || 'result.pdf');
    const collapsed = trimmed.replace(/[^\w.\- ]+/g, '_').trim();
    const withExtension = collapsed.toLowerCase().endsWith('.pdf')
      ? collapsed
      : `${collapsed || 'result'}.pdf`;
    return withExtension.slice(0, 255);
  }

  private resolvePath(storageKey: string): string {
    const normalizedKey = normalize(storageKey).replace(/^([/\\])+/, '');
    const fullPath = join(this.storageDir, normalizedKey);
    const relativePath = relative(this.storageDir, fullPath);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new InternalServerErrorException('Invalid result document storage path');
    }
    return fullPath;
  }
}
