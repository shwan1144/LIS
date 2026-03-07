import axios, { AxiosInstance } from 'axios';

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

export class CloudClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      timeout: this.parsePositiveInt(process.env.FORWARD_TIMEOUT_MS, 8000),
      headers: {
        'Content-Type': 'application/json',
      },
    });
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
    const res = await this.http.post(`${apiBaseUrl}/gateway/activate`, payload);
    return res.data;
  }

  async refresh(
    apiBaseUrl: string,
    payload: { gatewayId: string; refreshToken: string },
  ): Promise<{ accessToken: string; refreshToken?: string; expiresInSec: number }> {
    const res = await this.http.post(`${apiBaseUrl}/gateway/token/refresh`, payload);
    return res.data;
  }

  async getConfig(
    apiBaseUrl: string,
    accessToken: string,
    etag?: string | null,
  ): Promise<{ status: number; data: GatewayCloudConfigResponse | null; etag: string | null }> {
    const response = await this.http.get(`${apiBaseUrl}/gateway/config`, {
      validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(etag ? { 'If-None-Match': etag } : {}),
      },
    });
    return {
      status: response.status,
      data: response.status === 304 ? null : (response.data as GatewayCloudConfigResponse),
      etag: typeof response.headers.etag === 'string' ? response.headers.etag : null,
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
    const res = await this.http.post(`${apiBaseUrl}/gateway/messages`, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return res.data;
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
    const res = await this.http.post(`${apiBaseUrl}/gateway/heartbeat`, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return res.data;
  }

  private parsePositiveInt(rawValue: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(rawValue || '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
  }
}
