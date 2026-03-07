export interface GatewayCloudInstrumentConfig {
  instrumentId: string;
  name: string;
  protocol: string;
  connectionType: string;
  port: number;
  hl7StartBlock: string;
  hl7EndBlock: string;
  enabled: boolean;
}

export interface GatewayCloudConfigResponse {
  gatewayId: string;
  pollIntervalSec: number;
  heartbeatIntervalSec: number;
  instruments: GatewayCloudInstrumentConfig[];
}

export class CloudHttpError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(status: number, data: unknown, message: string) {
    super(message);
    this.name = 'CloudHttpError';
    this.status = status;
    this.data = data;
  }
}

export function isCloudHttpError(error: unknown): error is CloudHttpError {
  return error instanceof CloudHttpError;
}

export class CloudClient {
  private readonly timeoutMs: number;

  constructor() {
    this.timeoutMs = this.parsePositiveInt(process.env.FORWARD_TIMEOUT_MS, 8000);
  }

  async activate(
    apiBaseUrl: string,
    payload: {
      activationCode: string;
      deviceName: string;
      machineFingerprint: string;
      gatewayVersion: string;
    },
  ): Promise<{ gatewayId: string; accessToken: string; refreshToken: string; expiresInSec: number }> {
    const res = await this.requestGatewayEndpoint(
      apiBaseUrl,
      'activate',
      {
        method: 'POST',
        headers: this.jsonHeaders(),
        body: JSON.stringify(payload),
      },
      [],
    );
    return res.data as {
      gatewayId: string;
      accessToken: string;
      refreshToken: string;
      expiresInSec: number;
    };
  }

  async refresh(
    apiBaseUrl: string,
    payload: { gatewayId: string; refreshToken: string },
  ): Promise<{ accessToken: string; refreshToken?: string; expiresInSec: number }> {
    const res = await this.requestGatewayEndpoint(
      apiBaseUrl,
      'token/refresh',
      {
        method: 'POST',
        headers: this.jsonHeaders(),
        body: JSON.stringify(payload),
      },
      [],
    );
    return res.data as { accessToken: string; refreshToken?: string; expiresInSec: number };
  }

  async getConfig(
    apiBaseUrl: string,
    accessToken: string,
    etag?: string | null,
  ): Promise<{ status: number; data: GatewayCloudConfigResponse | null; etag: string | null }> {
    const response = await this.requestGatewayEndpoint(
      apiBaseUrl,
      'config',
      {
        method: 'GET',
        headers: {
          ...this.jsonHeaders(),
          Authorization: `Bearer ${accessToken}`,
          ...(etag ? { 'If-None-Match': etag } : {}),
        },
      },
      [304],
    );
    return {
      status: response.status,
      data: response.status === 304 ? null : (response.data as GatewayCloudConfigResponse),
      etag: response.headers.get('etag'),
    };
  }

  async postMessage(
    apiBaseUrl: string,
    accessToken: string,
    payload: {
      gatewayId: string;
      localMessageId: string;
      instrumentId: string;
      receivedAt: string;
      rawMessage: string;
      protocolHint?: string | null;
      sourceMeta?: { remoteAddress?: string; remotePort?: number } | null;
    },
  ): Promise<{ accepted: boolean; serverMessageId?: string; duplicate?: boolean }> {
    const res = await this.requestGatewayEndpoint(
      apiBaseUrl,
      'messages',
      {
        method: 'POST',
        headers: {
          ...this.jsonHeaders(),
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      },
      [],
    );
    return res.data as { accepted: boolean; serverMessageId?: string; duplicate?: boolean };
  }

  async postHeartbeat(
    apiBaseUrl: string,
    accessToken: string,
    payload: {
      gatewayId: string;
      version: string;
      queueDepth: number;
      listeners: Array<{ instrumentId: string; state: string; lastError: string | null }>;
    },
  ): Promise<{ accepted: boolean }> {
    const res = await this.requestGatewayEndpoint(
      apiBaseUrl,
      'heartbeat',
      {
        method: 'POST',
        headers: {
          ...this.jsonHeaders(),
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      },
      [],
    );
    return res.data as { accepted: boolean };
  }

  private parsePositiveInt(rawValue: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(rawValue || '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
  }

  private jsonHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  private async requestGatewayEndpoint(
    apiBaseUrl: string,
    endpointPath: string,
    init: RequestInit,
    allowedStatuses: number[],
  ): Promise<{ status: number; data: unknown; headers: Headers }> {
    const candidateUrls = this.buildGatewayUrls(apiBaseUrl, endpointPath);
    let lastNotFoundError: CloudHttpError | null = null;

    for (const url of candidateUrls) {
      try {
        return await this.request(url, init, allowedStatuses);
      } catch (error) {
        if (error instanceof CloudHttpError && error.status === 404 && candidateUrls.length > 1) {
          lastNotFoundError = error;
          continue;
        }
        throw error;
      }
    }

    if (lastNotFoundError) {
      throw lastNotFoundError;
    }
    throw new Error('Gateway endpoint request failed');
  }

  private buildGatewayUrls(apiBaseUrl: string, endpointPath: string): string[] {
    const normalized = this.trimTrailingSlash(apiBaseUrl);
    const basePath = `/gateway/${endpointPath}`;
    const candidates = [`${normalized}${basePath}`];

    if (normalized.toLowerCase().endsWith('/api')) {
      const withoutApi = normalized.slice(0, -4);
      candidates.push(`${withoutApi}${basePath}`);
    } else {
      candidates.push(`${normalized}/api${basePath}`);
    }

    return Array.from(new Set(candidates));
  }

  private trimTrailingSlash(input: string): string {
    return input.replace(/\/+$/, '');
  }

  private async request(
    url: string,
    init: RequestInit,
    allowedStatuses: number[],
  ): Promise<{ status: number; data: unknown; headers: Headers }> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      const bodyText = await response.text();
      const body = this.parseBody(bodyText);

      if (!response.ok && !allowedStatuses.includes(response.status)) {
        const message = this.extractErrorMessage(body) || response.statusText || 'Request failed';
        throw new CloudHttpError(response.status, body, message);
      }

      return {
        status: response.status,
        data: body,
        headers: response.headers,
      };
    } catch (error) {
      if (error instanceof CloudHttpError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private parseBody(bodyText: string): unknown {
    if (!bodyText) return null;
    try {
      return JSON.parse(bodyText);
    } catch {
      return bodyText;
    }
  }

  private extractErrorMessage(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;
    const source = body as Record<string, unknown>;

    if (typeof source.message === 'string' && source.message.trim()) {
      return source.message;
    }
    if (typeof source.error === 'string' && source.error.trim()) {
      return source.error;
    }
    return null;
  }
}
