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
exports.LocalConfigStore = void 0;
const fs = __importStar(require("fs"));
const crypto_1 = require("crypto");
const secret_store_1 = require("./secret-store");
const runtime_paths_1 = require("./runtime-paths");
class LocalConfigStore {
    paths;
    config;
    constructor() {
        this.paths = (0, runtime_paths_1.resolveRuntimePaths)();
        this.config = this.loadOrCreate();
    }
    getPaths() {
        return this.paths;
    }
    getConfig() {
        const token = this.config.token;
        return {
            apiBaseUrl: this.config.apiBaseUrl,
            gatewayId: this.config.gatewayId,
            accessToken: token ? (0, secret_store_1.decryptSecret)(token.access) : null,
            refreshToken: token ? (0, secret_store_1.decryptSecret)(token.refresh) : null,
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
    setApiBaseUrl(apiBaseUrl) {
        this.config.apiBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
        this.save();
    }
    setGatewayIdentity(gatewayId) {
        this.config.gatewayId = gatewayId;
        this.save();
    }
    setTokenState(accessToken, refreshToken, expiresAt) {
        this.config.token = {
            access: (0, secret_store_1.encryptSecret)(accessToken),
            refresh: (0, secret_store_1.encryptSecret)(refreshToken),
            expiresAt,
        };
        this.save();
    }
    clearTokenState() {
        this.config.token = null;
        this.save();
    }
    setLastConfigEtag(etag) {
        this.config.lastConfigEtag = etag;
        this.save();
    }
    setQueueSettings(retentionDays, maxBytes) {
        this.config.queue.retentionDays = retentionDays;
        this.config.queue.maxBytes = maxBytes;
        this.save();
    }
    loadOrCreate() {
        if (fs.existsSync(this.paths.configFile)) {
            const parsed = JSON.parse(fs.readFileSync(this.paths.configFile, 'utf8'));
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
            localApiToken: (0, crypto_1.randomBytes)(24).toString('hex'),
        });
        fs.writeFileSync(this.paths.configFile, JSON.stringify(created, null, 2));
        return created;
    }
    applyDefaults(input) {
        const queueRetention = this.parsePositiveInt(input?.queue?.retentionDays != null ? String(input.queue.retentionDays) : undefined, this.parsePositiveInt(process.env.QUEUE_RETENTION_DAYS, 7));
        const queueMaxBytes = this.parsePositiveInt(input?.queue?.maxBytes != null ? String(input.queue.maxBytes) : undefined, this.parsePositiveInt(process.env.QUEUE_MAX_BYTES, 2 * 1024 * 1024 * 1024));
        return {
            apiBaseUrl: (input?.apiBaseUrl || '').trim().replace(/\/+$/, ''),
            gatewayId: input?.gatewayId || null,
            token: input?.token || null,
            queue: {
                retentionDays: queueRetention,
                maxBytes: queueMaxBytes,
            },
            lastConfigEtag: input?.lastConfigEtag || null,
            localApiToken: input?.localApiToken || (0, crypto_1.randomBytes)(24).toString('hex'),
        };
    }
    parsePositiveInt(rawValue, fallback) {
        const parsed = Number.parseInt(rawValue || '', 10);
        if (!Number.isFinite(parsed) || parsed <= 0)
            return fallback;
        return parsed;
    }
    save() {
        fs.writeFileSync(this.paths.configFile, JSON.stringify(this.config, null, 2));
    }
}
exports.LocalConfigStore = LocalConfigStore;
