"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayAgent = void 0;
const crypto_1 = require("crypto");
const os = __importStar(require("os"));
const logger_1 = require("./logger");
const local_config_store_1 = require("./local-config-store");
const cloud_client_1 = require("./cloud-client");
const forwarder_1 = require("./forwarder");
const sqlite_store_1 = require("./queue/sqlite-store");
const outbox_1 = require("./queue/outbox");
const listener_manager_1 = require("./listener-manager");
const local_api_server_1 = require("./local-api-server");
class GatewayAgent {
    configStore = new local_config_store_1.LocalConfigStore();
    cloudClient = new cloud_client_1.CloudClient();
    sqliteStore = null;
    outbox = null;
    listenerManager = null;
    localApiServer = null;
    forwarder = null;
    configTimer = null;
    heartbeatTimer = null;
    syncInProgress = false;
    heartbeatInProgress = false;
    lastSyncAt = null;
    lastError = null;
    activeCloudConfig = null;
    start() {
        const paths = this.configStore.getPaths();
        const config = this.configStore.getConfig();
        logger_1.logger.log(`Starting LIS Gateway service from ${paths.rootDir}`, 'System');
        const queueConfig = this.loadOutboxConfig(config.queue.maxBytes, config.queue.retentionDays);
        const dbPath = (process.env.QUEUE_DB_PATH || '').trim() || `${paths.dataDir}\\gateway-queue.db`;
        this.sqliteStore = new sqlite_store_1.SQLiteStore(dbPath);
        this.forwarder = new forwarder_1.Forwarder((message) => this.deliverOutboxMessage(message));
        this.outbox = new outbox_1.Outbox(this.sqliteStore, this.forwarder, queueConfig);
        this.listenerManager = new listener_manager_1.ListenerManager((input) => this.enqueueIncomingMessage(input));
        this.outbox.start();
        const localPort = this.parsePositiveInt(process.env.LOCAL_API_PORT, 17880);
        this.localApiServer = new local_api_server_1.LocalApiServer(config.localApiToken, this, localPort);
        this.localApiServer.start();
        this.scheduleConfigPoll(this.parsePositiveInt(process.env.GATEWAY_CONFIG_POLL_SEC, 60) * 1000);
        this.scheduleHeartbeat(this.parsePositiveInt(process.env.GATEWAY_HEARTBEAT_SEC, 30) * 1000);
        if (config.apiBaseUrl && config.gatewayId && config.accessToken && config.refreshToken) {
            void this.syncNow();
        }
        else {
            logger_1.logger.warn('Gateway is not activated yet. Use local API POST /local/activate from GUI to bind this device.', 'System');
        }
    }
    stop() {
        if (this.configTimer)
            clearInterval(this.configTimer);
        if (this.heartbeatTimer)
            clearInterval(this.heartbeatTimer);
        this.configTimer = null;
        this.heartbeatTimer = null;
        this.listenerManager?.stopAll();
        this.outbox?.stop();
        this.localApiServer?.stop();
        this.sqliteStore?.close();
    }
    async activate(input) {
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
        this.configStore.setTokenState(response.accessToken, response.refreshToken, new Date(Date.now() + response.expiresInSec * 1000).toISOString());
        logger_1.logger.log(`Gateway activated successfully as ${response.gatewayId}`, 'Auth');
        const syncResult = await this.syncNow();
        return {
            success: true,
            gatewayId: response.gatewayId,
            sync: syncResult,
        };
    }
    async syncNow() {
        if (this.syncInProgress) {
            return { success: true, skipped: true, reason: 'sync already in progress' };
        }
        this.syncInProgress = true;
        try {
            const config = this.configStore.getConfig();
            if (!config.apiBaseUrl || !config.gatewayId) {
                return { success: false, reason: 'gateway not activated' };
            }
            let token = await this.ensureAccessToken();
            let response;
            try {
                response = await this.cloudClient.getConfig(config.apiBaseUrl, token, config.lastConfigEtag);
            }
            catch (error) {
                if ((0, cloud_client_1.isCloudHttpError)(error) && error.status === 401) {
                    token = await this.ensureAccessToken(true);
                    response = await this.cloudClient.getConfig(config.apiBaseUrl, token, config.lastConfigEtag);
                }
                else {
                    throw error;
                }
            }
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
            this.listenerManager?.applyConfig(response.data.instruments
                .filter((item) => item.enabled && Number.isFinite(item.port))
                .map((item) => ({
                instrumentId: item.instrumentId,
                name: item.name,
                port: item.port,
                hl7StartBlock: item.hl7StartBlock || '\x0b',
                hl7EndBlock: item.hl7EndBlock || '\x1c\x0d',
                enabled: item.enabled !== false,
            })));
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
            logger_1.logger.log(`Applied cloud config with ${response.data.instruments.length} instrument listener(s)`, 'Config');
            return {
                success: true,
                gatewayId: response.data.gatewayId,
                listeners: this.listenerManager?.getStatus() || [],
            };
        }
        catch (error) {
            const message = this.toErrorMessage(error);
            this.lastError = message;
            logger_1.logger.error(`Cloud config sync failed: ${message}`, 'Config');
            return { success: false, error: message };
        }
        finally {
            this.syncInProgress = false;
        }
    }
    async getStatus() {
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
            logFile: logger_1.logger.getLogFilePath(),
        };
    }
    getLogs(limit) {
        return logger_1.logger.getRecent(limit);
    }
    getConfigView() {
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
    async deliverOutboxMessage(message) {
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
        }
        catch (error) {
            if ((0, cloud_client_1.isCloudHttpError)(error) && error.status === 401) {
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
    enqueueIncomingMessage(input) {
        try {
            this.outbox?.enqueue({
                instrumentId: input.instrumentId,
                rawMessage: input.rawMessage,
                protocolHint: 'HL7_V2',
            });
        }
        catch (error) {
            const message = this.toErrorMessage(error);
            logger_1.logger.error(`Failed to enqueue incoming message for ${input.instrumentId}: ${message}`, 'Listener');
        }
    }
    async sendHeartbeat() {
        if (this.heartbeatInProgress)
            return;
        this.heartbeatInProgress = true;
        try {
            const config = this.configStore.getConfig();
            if (!config.apiBaseUrl || !config.gatewayId || !config.refreshToken) {
                return;
            }
            let accessToken = await this.ensureAccessToken();
            const listeners = this.listenerManager?.getStatus().map((item) => ({
                instrumentId: item.instrumentId,
                state: item.state,
                lastError: item.lastError,
            })) || [];
            const queueDepth = this.outbox?.getStats().queueDepth || 0;
            try {
                await this.cloudClient.postHeartbeat(config.apiBaseUrl, accessToken, {
                    gatewayId: config.gatewayId,
                    version: this.resolveGatewayVersion(),
                    queueDepth,
                    listeners,
                });
            }
            catch (error) {
                if ((0, cloud_client_1.isCloudHttpError)(error) && error.status === 401) {
                    accessToken = await this.ensureAccessToken(true);
                    await this.cloudClient.postHeartbeat(config.apiBaseUrl, accessToken, {
                        gatewayId: config.gatewayId,
                        version: this.resolveGatewayVersion(),
                        queueDepth,
                        listeners,
                    });
                }
                else {
                    throw error;
                }
            }
        }
        catch (error) {
            logger_1.logger.warn(`Heartbeat failed: ${this.toErrorMessage(error)}`, 'Heartbeat');
        }
        finally {
            this.heartbeatInProgress = false;
        }
    }
    async ensureAccessToken(forceRefresh = false) {
        const config = this.configStore.getConfig();
        if (!config.apiBaseUrl || !config.gatewayId || !config.refreshToken) {
            throw new Error('Gateway is not activated');
        }
        const expiresAtMs = config.accessExpiresAt ? Date.parse(config.accessExpiresAt) : 0;
        const hasValidAccess = Boolean(config.accessToken) &&
            Number.isFinite(expiresAtMs) &&
            expiresAtMs > Date.now() + 60 * 1000;
        if (!forceRefresh && hasValidAccess) {
            return config.accessToken;
        }
        const refreshed = await this.cloudClient.refresh(config.apiBaseUrl, {
            gatewayId: config.gatewayId,
            refreshToken: config.refreshToken,
        });
        const nextRefreshToken = refreshed.refreshToken || config.refreshToken;
        const expiresAt = new Date(Date.now() + refreshed.expiresInSec * 1000).toISOString();
        this.configStore.setTokenState(refreshed.accessToken, nextRefreshToken, expiresAt);
        logger_1.logger.log('Gateway access token refreshed', 'Auth');
        return refreshed.accessToken;
    }
    loadOutboxConfig(maxBytes, retentionDays) {
        return {
            batchSize: this.parsePositiveInt(process.env.QUEUE_BATCH_SIZE, 50),
            dispatchIntervalMs: this.parsePositiveInt(process.env.DISPATCH_INTERVAL_MS, 1000),
            cleanupIntervalMs: this.parsePositiveInt(process.env.CLEANUP_INTERVAL_MS, 60000),
            retentionDays: this.parsePositiveInt(process.env.QUEUE_RETENTION_DAYS, retentionDays),
            retryBaseMs: this.parsePositiveInt(process.env.QUEUE_RETRY_BASE_MS, 2000),
            retryMaxMs: this.parsePositiveInt(process.env.QUEUE_RETRY_MAX_MS, 300000),
            retryJitterFactor: this.parseNonNegativeInt(process.env.QUEUE_RETRY_JITTER_PERCENT, 20) / 100,
            maxDbBytes: this.parsePositiveInt(process.env.QUEUE_MAX_BYTES, maxBytes),
        };
    }
    parsePositiveInt(rawValue, fallback) {
        const parsed = parseInt(rawValue || '', 10);
        if (!Number.isFinite(parsed) || parsed <= 0)
            return fallback;
        return parsed;
    }
    parseNonNegativeInt(rawValue, fallback) {
        const parsed = parseInt(rawValue || '', 10);
        if (!Number.isFinite(parsed) || parsed < 0)
            return fallback;
        return parsed;
    }
    scheduleConfigPoll(intervalMs) {
        if (this.configTimer)
            clearInterval(this.configTimer);
        this.configTimer = setInterval(() => {
            void this.syncNow();
        }, intervalMs);
        logger_1.logger.log(`Config polling scheduled every ${intervalMs}ms`, 'Config');
    }
    scheduleHeartbeat(intervalMs) {
        if (this.heartbeatTimer)
            clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => {
            void this.sendHeartbeat();
        }, intervalMs);
        logger_1.logger.log(`Heartbeat scheduled every ${intervalMs}ms`, 'Heartbeat');
    }
    resolveGatewayVersion() {
        return ((process.env.GATEWAY_VERSION || '').trim() ||
            (process.env.npm_package_version || '').trim() ||
            '1.0.0');
    }
    buildMachineFingerprint() {
        const raw = [
            os.hostname(),
            os.platform(),
            os.arch(),
            os.release(),
            os.userInfo().username,
        ].join('|');
        return (0, crypto_1.createHash)('sha256').update(raw).digest('hex');
    }
    toErrorMessage(error) {
        if ((0, cloud_client_1.isCloudHttpError)(error)) {
            const source = error.data && typeof error.data === 'object'
                ? error.data
                : null;
            const responseMessage = source && typeof source.message === 'string'
                ? source.message
                : source && typeof source.error === 'string'
                    ? source.error
                    : null;
            const message = responseMessage || error.message || 'Request failed';
            return `HTTP ${error.status}: ${message}`;
        }
        if (error instanceof Error)
            return error.message;
        return String(error);
    }
}
exports.GatewayAgent = GatewayAgent;
