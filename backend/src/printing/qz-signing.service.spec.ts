import { generateKeyPairSync } from 'crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { QzSigningService } from './qz-signing.service';

describe('QzSigningService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.QZ_CERT_PEM;
    delete process.env.QZ_CERT_PATH;
    delete process.env.QZ_PRIVATE_KEY_PEM;
    delete process.env.QZ_PRIVATE_KEY_PATH;
    delete process.env.QZ_PRIVATE_KEY_PASSPHRASE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns the configured certificate', () => {
    process.env.QZ_CERT_PEM = '-----BEGIN CERTIFICATE-----\\nTEST\\n-----END CERTIFICATE-----';
    process.env.QZ_PRIVATE_KEY_PEM = '-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----';
    const service = new QzSigningService();

    expect(service.getCertificate()).toBe('-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----');
  });

  it('signs payloads with the configured private key', () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: {
        format: 'pem',
        type: 'pkcs8',
      },
      publicKeyEncoding: {
        format: 'pem',
        type: 'spki',
      },
    });

    process.env.QZ_CERT_PEM = '-----BEGIN CERTIFICATE-----\\nTEST\\n-----END CERTIFICATE-----';
    process.env.QZ_PRIVATE_KEY_PEM = privateKey.replace(/\n/g, '\\n');
    const service = new QzSigningService();

    expect(service.signPayload('print-me')).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('throws when certificate configuration is missing', () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: {
        format: 'pem',
        type: 'pkcs8',
      },
      publicKeyEncoding: {
        format: 'pem',
        type: 'spki',
      },
    });
    process.env.QZ_PRIVATE_KEY_PEM = privateKey.replace(/\n/g, '\\n');
    const service = new QzSigningService();

    expect(() => service.getCertificate()).toThrow(ServiceUnavailableException);
  });
});
