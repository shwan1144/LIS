import { createHash } from 'crypto';
import * as os from 'os';
import axios from 'axios';
import { logger } from './logger';
import { LocalConfigStore } from './local-config-store';
import { CloudClient, type GatewayCloudConfigResponse } from './cloud-client';
import { Forwarder } from './forwarder';
import { SQLiteStore } from './queue/sqlite-store';
import { Outbox } from './queue/outbox';
import type { OutboxRuntimeConfig } from './queue/types';
import { ListenerManager } from './listener-manager';
import { LocalApiServer } from './local-api-server';

export class GatewayAgent {
  private readonly configStore = new LocalConfigStore();
  private readonly cloudClient = new CloudClient();
  private sqliteStore: SQLiteStore | null = null;
  private outbox: Outbox | null = null;
  private listenerManager: ListenerManager | null = null;
  private localApiServer: LocalApiServer | null = null;
  private forwarder: Forwarder | null = null;
  private configTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private syncInProgress = false;
  private heartbeatInProgress = false;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  private activeCloudConfig: GatewayCloudConfigResponse | null = null;

  start(): void {
    const paths = this.configStore.getPaths();
    const config = this.configStore.getConfig();
    logger.log(`Starting LIS Gateway service from ${paths.rootDir}`, 'System');

    const queueConfig = this.loadOutboxConfig(config.queue.maxBytes, config.queue.retentionDays);
    const dbPath = (process.env.QUEUE_DB_PATH || '').trim() || `${paths.dataDir}\\gateway-queue.db`;

    this.sqliteStore = new SQLiteStore(dbPath);
    this.forwarder = new Forwarder((message) => this.deliverOutboxMessage(message));
    this.outbox = new Outbox(this.sqliteStore, this.forwarder, queueConfig);
    this.listenerManager = new ListenerManager((input) => this.enqueueIncomingMessage(input));
    this.outbox.start();

    const localPort = this.parsePositiveInt(process.env.LOCAL_API_PORT, 17880);
    this.localApiServer = new LocalApiServer(config.localApiToken, this, localPort);
    this.localApiServer.start();

    this.scheduleConfigPoll(this.parsePositiveInt(process.env.GATEWAY_CONFIG_POLL_SEC, 60) * 1000);
    this.scheduleHeartbeat(this.parsePositiveInt(process.env.GATEWAY_HEARTBEAT_SEC, 30) * 1000);

    if (config.apiBaseUrl && config.gatewayId && config.accessToken && config.refreshToken) {
      void this.syncNow();
    } else {
      logger.warn(
        'Gateway is not activated yet. Use local API POST /local/activate from GUI to bind this device.',
        'System',
      );
    }
  }

  stop(): void {
    if (this.configTimer) clearInterval(this.configTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.configTimer = null;
    this.heartbeatTimer = null;

    this.listenerManager?.stopAll();
    this.outbox?.stop();
    this.localApiServer?.stop();
    this.sqliteStore?.close();
  }

  async activate(input: {
    activationCode: string;
    deviceName: string;
    apiBaseUrl?: string;
  }): Promise<Record<string, unknown>> {
    if (input.apiBaseUrl?.trim()) {
      this.configStore.setApiBaseUrl(input.apiBaseUrl);
    }

    const config = this.configStore.getConfig();
    if (!config.apiBaseUrl) {
      throw new Error('apiBaseUrl is required before activation');
    }

    const response = await this.cloudClient.activate(config.apiBaseUrl, {
      activationCode: input.activationCode,
      deviceName: input.deviceName,
      machineFingerprint: this.buildMachineFingerprint(),
      gatewayVersion: this.resolveGatewayVersion(),
    });

    this.configStore.setGatewayIdentity(response.gatewayId);
    this.configStore.setTokenState(
      response.accessToken,
      response.refreshToken,
      new Date(Date.now() + response.expiresInSec * 1000).toISOString(),
    );

    logger.log(`Gateway activated successfully as ${response.gatewayId}`, 'Auth');
    const syncResult = await this.syncNow();

    return {
      success: true,
      gatewayId: response.gatewayId,
      sync: syncResult,
    };
  }

  async syncNow(): Promise<Record<string, unknown>> {
    if (this.syncInProgress) {
      return { success: true, skipped: true, reason: 'sync already in progress' };
    }
    this.syncInProgress = true;

    try {
      const config = this.configStore.getConfig();
      if (!config.apiBaseUrl || !config.gatewayId) {
        return { success: false, reason: 'gateway not activated' };
      }

      const token = await this.ensureAccessToken();
      const response = await this.cloudClient.getConfig(
        config.apiBaseUrl,
        token,
        config.lastConfigEtag,
      );

      if (response.status === 304) {
        this.lastSyncAt = new Date().toISOString();
        return {
          success: true,
          unchanged: true,
          listeners: this.listenerManager?.getStatus() || [],
        };
      }

      if (!response.data) {
        throw new Error('Gateway config response is empty');
      }

      this.activeCloudConfig = response.data;
      this.listenerManager?.applyConfig(
        response.data.instruments
          .filter((item) => item.enabled && Number.isFinite(item.port))
          .map((item) => ({
            instrumentId: item.instrumentId,
            name: item.name,
            port: item.port,
            hl7StartBlock: item.hl7StartBlock || '\x0b',
            hl7EndBlock: item.hl7EndBlock || '\x1c\x0d',
            enabled: item.enabled !== false,
          })),
      );

      if (response.etag) {
        this.configStore.setLastConfigEtag(response.etag);
      }

      if (response.data.pollIntervalSec) {
        this.scheduleConfigPoll(Math.max(15, response.data.pollIntervalSec) * 1000);
      }
      if (response.data.heartbeatIntervalSec) {
        this.scheduleHeartbeat(Math.max(10, response.data.heartbeatIntervalSec) * 1000);
      }

      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
      logger.log(
        `Applied cloud config with ${response.data.instruments.length} instrument listener(s)`,
        'Config',
      );

      return {
        success: true,
        gatewayId: response.data.gatewayId,
        listeners: this.listenerManager?.getStatus() || [],
      };
    } catch (error) {
      const message = this.toErrorMessage(error);
      this.lastError = message;
      logger.error(`Cloud config sync failed: ${message}`, 'Config');
      return { success: false, error: message };
    } finally {
      this.syncInProgress = false;
    }
  }

  async getStatus(): Promise<Record<string, unknown>> {
    const config = this.configStore.getConfig();
    const stats = this.outbox?.getStats();
    return {
      activated: Boolean(config.gatewayId && config.refreshToken),
      apiBaseUrl: config.apiBaseUrl,
      gatewayId: config.gatewayId,
      queue: stats || null,
      listeners: this.listenerManager?.getStatus() || [],
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      version: this.resolveGatewayVersion(),
      logFile: logger.getLogFilePath(),
    };
  }

  getLogs(limit: number): string[] {
    return logger.getRecent(limit);
  }

  getConfigView(): Record<string, unknown> {
    return {
      ...this.configStore.getSanitizedView(),
      listeners: this.listenerManager?.getStatus() || [],
      activeCloudConfig: this.activeCloudConfig
        ? {
            gatewayId: this.activeCloudConfig.gatewayId,
            pollIntervalSec: this.activeCloudConfig.pollIntervalSec,
            heartbeatIntervalSec: this.activeCloudConfig.heartbeatIntervalSec,
            instruments: this.activeCloudConfig.instruments.map((item) => ({
              instrumentId: item.instrumentId,
              name: item.name,
              port: item.port,
              enabled: item.enabled,
            })),
          }
        : null,
    };
  }

  private async deliverOutboxMessage(message: {
    id: string;
    instrumentId: string;
    rawMessage: string;
    protocolHint?: string | null;
  }): Promise<{ messageId?: string; warning?: string }> {
    const config = this.configStore.getConfig();
    if (!config.apiBaseUrl || !config.gatewayId) {
      throw new Error('Gateway is not configured');
    }

    let accessToken = await this.ensureAccessToken();
    try {
      const result = await this.cloudClient.postMessage(config.apiBaseUrl, accessToken, {
        gatewayId: config.gatewayId,
        localMessageId: message.id,
        instrumentId: message.instrumentId,
        receivedAt: new Date().toISOString(),
        rawMessage: message.rawMessage,
        protocolHint: message.protocolHint || 'HL7_V2',
      });
      return {
        messageId: result.serverMessageId,
        warning: result.duplicate ? 'Duplicate acknowledged by backend' : undefined,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        accessToken = await this.ensureAccessToken(true);
        const retried = await this.cloudClient.postMessage(config.apiBaseUrl, accessToken, {
          gatewayId: config.gatewayId,
          localMessageId: message.id,
          instrumentId: message.instrumentId,
          receivedAt: new Date().toISOString(),
          rawMessage: message.rawMessage,
          protocolHint: message.protocolHint || 'HL7_V2',
        });
        return {
          messageId: retried.serverMessageId,
          warning: retried.duplicate ? 'Duplicate acknowledged by backend' : undefined,
        };
      }
      throw error;
    }
  }

  private enqueueIncomingMessage(input: {
    instrumentId: string;
    rawMessage: string;
    remoteAddress?: string;
    remotePort?: number;
  }): void {
    try {
      this.outbox?.enqueue({
        instrumentId: input.instrumentId,
        rawMessage: input.rawMessage,
        protocolHint: 'HL7_V2',
      });
    } catch (error) {
      const message = this.toErrorMessage(error);
      logger.error(
        `Failed to enqueue incoming message for ${input.instrumentId}: ${message}`,
        'Listener',
      );
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (this.heartbeatInProgress) return;
    this.heartbeatInProgress = true;
    try {
      const config = this.configStore.getConfig();
      if (!config.apiBaseUrl || !config.gatewayId || !config.refreshToken) {
        return;
      }

      const accessToken = await this.ensureAccessToken();
      const listeners =
        this.listenerManager?.getStatus().map((item) => ({
          instrumentId: item.instrumentId,
          state: item.state,
          lastError: item.lastError,
        })) || [];
      const queueDepth = this.outbox?.getStats().queueDepth || 0;

      await this.cloudClient.postHeartbeat(config.apiBaseUrl, accessToken, {
        gatewayId: config.gatewayId,
        version: this.resolveGatewayVersion(),
        queueDepth,
        listeners,
      });
    } catch (error) {
      logger.warn(`Heartbeat failed: ${this.toErrorMessage(error)}`, 'Heartbeat');
    } finally {
      this.heartbeatInProgress = false;
    }
  }

  private async ensureAccessToken(forceRefresh = false): Promise<string> {
    const config = this.configStore.getConfig();
    if (!config.apiBaseUrl || !config.gatewayId || !config.refreshToken) {
      throw new Error('Gateway is not activated');
    }

    const expiresAtMs = config.accessExpiresAt ? Date.parse(config.accessExpiresAt) : 0;
    const hasValidAccess =
      Boolean(config.accessToken) &&
      Number.isFinite(expiresAtMs) &&
      expiresAtMs > Date.now() + 60 * 1000;

    if (!forceRefresh && hasValidAccess) {
      return config.accessToken as string;
    }

    const refreshed = await this.cloudClient.refresh(config.apiBaseUrl, {
      gatewayId: config.gatewayId,
      refreshToken: config.refreshToken,
    });

    const nextRefreshToken = refreshed.refreshToken || config.refreshToken;
    const expiresAt = new Date(Date.now() + refreshed.expiresInSec * 1000).toISOString();
    this.configStore.setTokenState(refreshed.accessToken, nextRefreshToken, expiresAt);
    logger.log('Gateway access token refreshed', 'Auth');
    return refreshed.accessToken;
  }

  private loadOutboxConfig(maxBytes: number, retentionDays: number): OutboxRuntimeConfig {
    return {
      batchSize: this.parsePositiveInt(process.env.QUEUE_BATCH_SIZE, 50),
      dispatchIntervalMs: this.parsePositiveInt(process.env.DISPATCH_INTERVAL_MS, 1000),
      cleanupIntervalMs: this.parsePositiveInt(process.env.CLEANUP_INTERVAL_MS, 60000),
      retentionDays: this.parsePositiveInt(process.env.QUEUE_RETENTION_DAYS, retentionDays),
      retryBaseMs: this.parsePositiveInt(process.env.QUEUE_RETRY_BASE_MS, 2000),
      retryMaxMs: this.parsePositiveInt(process.env.QUEUE_RETRY_MAX_MS, 300000),
      retryJitterFactor:
        this.parseNonNegativeInt(process.env.QUEUE_RETRY_JITTER_PERCENT, 20) / 100,
      maxDbBytes: this.parsePositiveInt(process.env.QUEUE_MAX_BYTES, maxBytes),
    };
  }

  private parsePositiveInt(rawValue: string | undefined, fallback: number): number {
    const parsed = parseInt(rawValue || '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
  }

  private parseNonNegativeInt(rawValue: string | undefined, fallback: number): number {
    const parsed = parseInt(rawValue || '', 10);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return parsed;
  }

  private scheduleConfigPoll(intervalMs: number): void {
    if (this.configTimer) clearInterval(this.configTimer);
    this.configTimer = setInterval(() => {
      void this.syncNow();
    }, intervalMs);
    logger.log(`Config polling scheduled every ${intervalMs}ms`, 'Config');
  }

  private scheduleHeartbeat(intervalMs: number): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat();
    }, intervalMs);
    logger.log(`Heartbeat scheduled every ${intervalMs}ms`, 'Heartbeat');
  }

  private resolveGatewayVersion(): string {
    return (
      (process.env.GATEWAY_VERSION || '').trim() ||
      (process.env.npm_package_version || '').trim() ||
      '1.0.0'
    );
  }

  private buildMachineFingerprint(): string {
    const raw = [
      os.hostname(),
      os.platform(),
      os.arch(),
      os.release(),
      os.userInfo().username,
    ].join('|');
    return createHash('sha256').update(raw).digest('hex');
  }

  private toErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const responseMessage = error.response?.data?.message;
      const fallback = error.message || 'Axios request failed';
      const message = typeof responseMessage === 'string' ? responseMessage : fallback;
      return status ? `HTTP ${status}: ${message}` : message;
    }
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
