import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createSign } from 'crypto';
import { readFileSync } from 'fs';

const QZ_SIGNATURE_ALGORITHM = 'SHA512';

type QzConfig = {
  certificate: string;
  privateKey: string;
  passphrase?: string;
};

@Injectable()
export class QzSigningService {
  getCertificate(): string {
    return this.loadConfig().certificate;
  }

  getSignatureAlgorithm(): string {
    return QZ_SIGNATURE_ALGORITHM;
  }

  signPayload(payload: string): string {
    const normalizedPayload = payload ?? '';
    if (!normalizedPayload.trim()) {
      throw new BadRequestException('QZ signing payload is empty');
    }

    const config = this.loadConfig();
    const signer = createSign('RSA-SHA512');
    signer.update(normalizedPayload, 'utf8');
    signer.end();

    return signer.sign(
      config.passphrase
        ? { key: config.privateKey, passphrase: config.passphrase }
        : config.privateKey,
      'base64',
    );
  }

  private loadConfig(): QzConfig {
    const certificate = this.readPemValue(
      process.env.QZ_CERT_PEM,
      process.env.QZ_CERT_PATH,
      'QZ certificate',
    );
    const privateKey = this.readPemValue(
      process.env.QZ_PRIVATE_KEY_PEM,
      process.env.QZ_PRIVATE_KEY_PATH,
      'QZ private key',
    );
    const passphrase = this.normalizeOptionalValue(process.env.QZ_PRIVATE_KEY_PASSPHRASE);

    return {
      certificate,
      privateKey,
      ...(passphrase ? { passphrase } : {}),
    };
  }

  private readPemValue(
    inlineValue: string | undefined,
    filePath: string | undefined,
    label: string,
  ): string {
    const normalizedInline = this.normalizeOptionalValue(inlineValue);
    if (normalizedInline) {
      return normalizedInline.replace(/\\n/g, '\n');
    }

    const normalizedPath = this.normalizeOptionalValue(filePath);
    if (normalizedPath) {
      try {
        return readFileSync(normalizedPath, 'utf8').trim();
      } catch (error) {
        throw new ServiceUnavailableException(
          `${label} could not be read from ${normalizedPath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const envHint = label === 'QZ certificate'
      ? 'QZ_CERT_PEM or QZ_CERT_PATH'
      : 'QZ_PRIVATE_KEY_PEM or QZ_PRIVATE_KEY_PATH';
    throw new ServiceUnavailableException(
      `${label} is not configured. Set ${envHint} on the backend.`,
    );
  }

  private normalizeOptionalValue(value: string | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
}
