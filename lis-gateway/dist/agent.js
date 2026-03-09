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
const path = __importStar(require("path"));
const logger_1 = require("./logger");
const local_config_store_1 = require("./local-config-store");
const cloud_client_1 = require("./cloud-client");
const forwarder_1 = require("./forwarder");
const sqlite_store_1 = require("./queue/sqlite-store");
const outbox_1 = require("./queue/outbox");
const listener_manager_1 = require("./listener-manager");
const local_api_server_1 = require("./local-api-server");
const serialport_1 = require("serialport");
const pdf_to_printer_1 = require("pdf-to-printer");
const fs = __importStar(require("fs"));
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
    configPollIntervalMs = 60000;
    heartbeatIntervalMs = 30000;
    lastConfigSyncAt = null;
    lastConfigError = null;
    lastHeartbeatAt = null;
    lastHeartbeatError = null;
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
                const now = new Date().toISOString();
                this.lastSyncAt = now;
                this.lastConfigSyncAt = now;
                this.lastConfigError = null;
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
            const listenerConfigs = [];
            for (const item of response.data.instruments) {
                if (!item.enabled)
                    continue;
                if (item.protocol === 'HL7_V2' &&
                    item.connectionType === 'TCP_SERVER' &&
                    Number.isFinite(item.port)) {
                    listenerConfigs.push({
                        instrumentId: item.instrumentId,
                        name: item.name,
                        protocol: 'HL7_V2',
                        connectionType: 'TCP_SERVER',
                        enabled: true,
                        port: item.port,
                        hl7StartBlock: item.hl7StartBlock || '\x0b',
                        hl7EndBlock: item.hl7EndBlock || '\x1c\x0d',
                    });
                    continue;
                }
                if (item.protocol === 'ASTM' &&
                    item.connectionType === 'SERIAL' &&
                    typeof item.serialPort === 'string' &&
                    item.serialPort.trim().length > 0 &&
                    Number.isFinite(item.baudRate) &&
                    typeof item.dataBits === 'string' &&
                    item.dataBits.trim().length > 0 &&
                    typeof item.parity === 'string' &&
                    item.parity.trim().length > 0 &&
                    typeof item.stopBits === 'string' &&
                    item.stopBits.trim().length > 0) {
                    listenerConfigs.push({
                        instrumentId: item.instrumentId,
                        name: item.name,
                        protocol: 'ASTM',
                        connectionType: 'SERIAL',
                        enabled: true,
                        serialPort: item.serialPort.trim(),
                        baudRate: item.baudRate,
                        dataBits: item.dataBits.trim(),
                        parity: item.parity.trim().toUpperCase(),
                        stopBits: item.stopBits.trim(),
                    });
                }
            }
            this.listenerManager?.applyConfig(listenerConfigs);
            if (response.etag) {
                this.configStore.setLastConfigEtag(response.etag);
            }
            if (response.data.pollIntervalSec) {
                this.scheduleConfigPoll(Math.max(15, response.data.pollIntervalSec) * 1000);
            }
            if (response.data.heartbeatIntervalSec) {
                this.scheduleHeartbeat(Math.max(10, response.data.heartbeatIntervalSec) * 1000);
            }
            const now = new Date().toISOString();
            this.lastSyncAt = now;
            this.lastConfigSyncAt = now;
            this.lastConfigError = null;
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
            this.lastConfigError = message;
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
        const activated = Boolean(config.gatewayId && config.refreshToken);
        return {
            activated,
            apiBaseUrl: config.apiBaseUrl,
            gatewayId: config.gatewayId,
            queue: stats || null,
            listeners: this.listenerManager?.getStatus() || [],
            lastSyncAt: this.lastConfigSyncAt || this.lastSyncAt,
            lastError: this.lastError,
            apiConnectivity: this.resolveApiConnectivity(activated),
            apiDetail: {
                lastConfigSyncAt: this.lastConfigSyncAt,
                lastHeartbeatAt: this.lastHeartbeatAt,
                lastConfigError: this.lastConfigError,
                lastHeartbeatError: this.lastHeartbeatError,
            },
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
                        protocol: item.protocol,
                        connectionType: item.connectionType,
                        port: item.port ?? null,
                        serialPort: item.serialPort ?? null,
                        baudRate: item.baudRate ?? null,
                        dataBits: item.dataBits ?? null,
                        parity: item.parity ?? null,
                        stopBits: item.stopBits ?? null,
                        enabled: item.enabled,
                    })),
                }
                : null,
        };
    }
    async listSerialPorts() {
        const ports = await serialport_1.SerialPort.list();
        return {
            ports: ports.map((item) => ({
                path: item.path,
                manufacturer: item.manufacturer || null,
                serialNumber: item.serialNumber || null,
                vendorId: item.vendorId || null,
                productId: item.productId || null,
            })),
        };
    }
    async testSerialOpen(input) {
        const serialPort = input.serialPort.trim();
        if (!serialPort) {
            return {
                ok: false,
                error: 'serialPort is required',
                openedAt: null,
                closedAt: null,
            };
        }
        const baudRate = Number.isFinite(input.baudRate) && (input.baudRate || 0) > 0
            ? Math.floor(input.baudRate)
            : 9600;
        const dataBitsRaw = (input.dataBits || '8').trim();
        const stopBitsRaw = (input.stopBits || '1').trim();
        const parityRaw = (input.parity || 'NONE').trim().toUpperCase();
        const timeoutMs = Math.max(500, Math.min(15000, Math.floor(input.timeoutMs || 3000)));
        const dataBits = dataBitsRaw === '7' ? 7 : 8;
        const stopBits = stopBitsRaw === '2' ? 2 : 1;
        const parity = parityRaw === 'EVEN' ? 'even' : parityRaw === 'ODD' ? 'odd' : 'none';
        return new Promise((resolve) => {
            const serial = new serialport_1.SerialPort({
                path: serialPort,
                baudRate,
                dataBits,
                stopBits,
                parity,
                autoOpen: false,
            });
            let finished = false;
            const finish = (payload) => {
                if (finished)
                    return;
                finished = true;
                if (serial.isOpen) {
                    serial.close(() => {
                        resolve({
                            ...payload,
                            closedAt: payload.closedAt || new Date().toISOString(),
                        });
                    });
                    return;
                }
                resolve(payload);
            };
            serial.once('error', (error) => {
                finish({
                    ok: false,
                    error: error.message,
                    openedAt: null,
                    closedAt: new Date().toISOString(),
                });
            });
            serial.open((error) => {
                if (error) {
                    finish({
                        ok: false,
                        error: error.message,
                        openedAt: null,
                        closedAt: new Date().toISOString(),
                    });
                    return;
                }
                const openedAt = new Date().toISOString();
                setTimeout(() => {
                    serial.close((closeError) => {
                        finish({
                            ok: !closeError,
                            error: closeError ? closeError.message : null,
                            openedAt,
                            closedAt: new Date().toISOString(),
                        });
                    });
                }, timeoutMs);
            });
            setTimeout(() => {
                if (!finished) {
                    finish({
                        ok: false,
                        error: `Serial test timed out after ${timeoutMs}ms`,
                        openedAt: null,
                        closedAt: new Date().toISOString(),
                    });
                }
            }, timeoutMs + 500);
            logger_1.logger.log(`Serial open test started for ${serialPort} @ ${baudRate} (${dataBitsRaw}${parityRaw[0] || 'N'}${stopBitsRaw})`, 'LocalAPI');
        });
    }
    async listPrinters() {
        try {
            const printers = await (0, pdf_to_printer_1.getPrinters)();
            return printers.map((p) => p.name);
        }
        catch (error) {
            logger_1.logger.error(`Failed to list printers: ${this.toErrorMessage(error)}`, 'LocalAPI');
            return [];
        }
    }
    async print(input) {
        const tempDir = os.tmpdir();
        const tempFileName = `print-${Date.now()}-${Math.floor(Math.random() * 10000)}.pdf`;
        const tempPath = path.join(tempDir, tempFileName);
        try {
            const buffer = Buffer.from(input.pdfBase64, 'base64');
            fs.writeFileSync(tempPath, buffer);
            await (0, pdf_to_printer_1.print)(tempPath, {
                printer: input.printerName,
            });
            logger_1.logger.log(`Print job sent to printer "${input.printerName}"`, 'LocalAPI');
            return { success: true };
        }
        catch (error) {
            const message = this.toErrorMessage(error);
            logger_1.logger.error(`Print failed for "${input.jobName || 'unnamed'}": ${message}`, 'LocalAPI');
            return { success: false, error: message };
        }
        finally {
            try {
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            }
            catch (e) {
                // ignore cleanup error
            }
        }
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
                protocolHint: input.protocolHint,
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
                this.lastHeartbeatAt = new Date().toISOString();
                this.lastHeartbeatError = null;
                if (!this.lastConfigError) {
                    this.lastError = null;
                }
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
                    this.lastHeartbeatAt = new Date().toISOString();
                    this.lastHeartbeatError = null;
                    if (!this.lastConfigError) {
                        this.lastError = null;
                    }
                }
                else {
                    throw error;
                }
            }
        }
        catch (error) {
            const message = this.toErrorMessage(error);
            this.lastHeartbeatError = message;
            if (!this.lastConfigError) {
                this.lastError = message;
            }
            logger_1.logger.warn(`Heartbeat failed: ${message}`, 'Heartbeat');
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
    resolveApiConnectivity(activated) {
        if (!activated)
            return 'DISCONNECTED';
        const configHealthy = this.isSignalHealthy(this.lastConfigSyncAt, this.lastConfigError, this.configPollIntervalMs);
        const heartbeatHealthy = this.isSignalHealthy(this.lastHeartbeatAt, this.lastHeartbeatError, this.heartbeatIntervalMs);
        if (configHealthy && heartbeatHealthy)
            return 'CONNECTED';
        if (!configHealthy && !heartbeatHealthy)
            return 'DISCONNECTED';
        return 'DEGRADED';
    }
    isSignalHealthy(timestampIso, lastError, intervalMs) {
        if (lastError)
            return false;
        if (!timestampIso)
            return false;
        const parsed = Date.parse(timestampIso);
        if (!Number.isFinite(parsed))
            return false;
        return Date.now() - parsed <= intervalMs * 2;
    }
    scheduleConfigPoll(intervalMs) {
        if (this.configTimer)
            clearInterval(this.configTimer);
        this.configPollIntervalMs = intervalMs;
        this.configTimer = setInterval(() => {
            void this.syncNow();
        }, intervalMs);
        logger_1.logger.log(`Config polling scheduled every ${intervalMs}ms`, 'Config');
    }
    scheduleHeartbeat(intervalMs) {
        if (this.heartbeatTimer)
            clearInterval(this.heartbeatTimer);
        this.heartbeatIntervalMs = intervalMs;
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
