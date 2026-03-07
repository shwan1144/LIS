import * as fs from 'fs';
import { randomBytes } from 'crypto';
import { decryptSecret, encryptSecret } from './secret-store';
import { resolveRuntimePaths, type RuntimePaths } from './runtime-paths';

export interface StoredTokenState {
  access: string;
  refresh: string;
  expiresAt: string;
}

export interface StoredAgentConfig {
  apiBaseUrl: string;
  gatewayId: string | null;
  token: StoredTokenState | null;
  queue: {
    retentionDays: number;
    maxBytes: number;
  };
  lastConfigEtag: string | null;
  localApiToken: string;
}

export interface PlainAgentConfig {
  apiBaseUrl: string;
  gatewayId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  accessExpiresAt: string | null;
  queue: {
    retentionDays: number;
    maxBytes: number;
  };
  lastConfigEtag: string | null;
  localApiToken: string;
}

export class LocalConfigStore {
  private readonly paths: RuntimePaths;
  private config: StoredAgentConfig;

  constructor() {
    this.paths = resolveRuntimePaths();
    this.config = this.loadOrCreate();
  }

  getPaths(): RuntimePaths {
    return this.paths;
  }

  getConfig(): PlainAgentConfig {
    const token = this.config.token;
    return {
      apiBaseUrl: this.config.apiBaseUrl,
      gatewayId: this.config.gatewayId,
      accessToken: token ? decryptSecret(token.access) : null,
      refreshToken: token ? decryptSecret(token.refresh) : null,
      accessExpiresAt: token?.expiresAt || null,
      queue: { ...this.config.queue },
      lastConfigEtag: this.config.lastConfigEtag,
      localApiToken: this.config.localApiToken,
    };
  }

  getSanitizedView() {
    return {
      apiBaseUrl: this.config.apiBaseUrl,
      gatewayId: this.config.gatewayId,
      token: this.config.token
        ? {
            hasAccessToken: Boolean(this.config.token.access),
            hasRefreshToken: Boolean(this.config.token.refresh),
            expiresAt: this.config.token.expiresAt,
          }
        : null,
      queue: this.config.queue,
      lastConfigEtag: this.config.lastConfigEtag,
      runtimePaths: this.paths,
    };
  }

  setApiBaseUrl(apiBaseUrl: string): void {
    this.config.apiBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
    this.save();
  }

  setGatewayIdentity(gatewayId: string): void {
    this.config.gatewayId = gatewayId;
    this.save();
  }

  setTokenState(accessToken: string, refreshToken: string, expiresAt: string): void {
    this.config.token = {
      access: encryptSecret(accessToken),
      refresh: encryptSecret(refreshToken),
      expiresAt,
    };
    this.save();
  }

  clearTokenState(): void {
    this.config.token = null;
    this.save();
  }

  setLastConfigEtag(etag: string | null): void {
    this.config.lastConfigEtag = etag;
    this.save();
  }

  setQueueSettings(retentionDays: number, maxBytes: number): void {
    this.config.queue.retentionDays = retentionDays;
    this.config.queue.maxBytes = maxBytes;
    this.save();
  }

  private loadOrCreate(): StoredAgentConfig {
    if (fs.existsSync(this.paths.configFile)) {
      const parsed = JSON.parse(fs.readFileSync(this.paths.configFile, 'utf8')) as StoredAgentConfig;
      return this.applyDefaults(parsed);
    }

    const created = this.applyDefaults({
      apiBaseUrl: (process.env.LIS_API_URL || '').trim().replace(/\/+$/, ''),
      gatewayId: (process.env.GATEWAY_ID || '').trim() || null,
      token: null,
      queue: {
        retentionDays: this.parsePositiveInt(process.env.QUEUE_RETENTION_DAYS, 7),
        maxBytes: this.parsePositiveInt(process.env.QUEUE_MAX_BYTES, 2 * 1024 * 1024 * 1024),
      },
      lastConfigEtag: null,
      localApiToken: randomBytes(24).toString('hex'),
    } as StoredAgentConfig);
    fs.writeFileSync(this.paths.configFile, JSON.stringify(created, null, 2));
    return created;
  }

  private applyDefaults(input: StoredAgentConfig): StoredAgentConfig {
    const queueRetention = this.parsePositiveInt(
      input?.queue?.retentionDays != null ? String(input.queue.retentionDays) : undefined,
      this.parsePositiveInt(process.env.QUEUE_RETENTION_DAYS, 7),
    );
    const queueMaxBytes = this.parsePositiveInt(
      input?.queue?.maxBytes != null ? String(input.queue.maxBytes) : undefined,
      this.parsePositiveInt(process.env.QUEUE_MAX_BYTES, 2 * 1024 * 1024 * 1024),
    );

    return {
      apiBaseUrl: (input?.apiBaseUrl || '').trim().replace(/\/+$/, ''),
      gatewayId: input?.gatewayId || null,
      token: input?.token || null,
      queue: {
        retentionDays: queueRetention,
        maxBytes: queueMaxBytes,
      },
      lastConfigEtag: input?.lastConfigEtag || null,
      localApiToken: input?.localApiToken || randomBytes(24).toString('hex'),
    };
  }

  private parsePositiveInt(rawValue: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(rawValue || '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
  }

  private save(): void {
    fs.writeFileSync(this.paths.configFile, JSON.stringify(this.config, null, 2));
  }
}
