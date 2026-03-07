"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudClient = void 0;
const axios_1 = __importDefault(require("axios"));
class CloudClient {
    http;
    constructor() {
        this.http = axios_1.default.create({
            timeout: this.parsePositiveInt(process.env.FORWARD_TIMEOUT_MS, 8000),
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    async activate(apiBaseUrl, payload) {
        const res = await this.http.post(`${apiBaseUrl}/gateway/activate`, payload);
        return res.data;
    }
    async refresh(apiBaseUrl, payload) {
        const res = await this.http.post(`${apiBaseUrl}/gateway/token/refresh`, payload);
        return res.data;
    }
    async getConfig(apiBaseUrl, accessToken, etag) {
        const response = await this.http.get(`${apiBaseUrl}/gateway/config`, {
            validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ...(etag ? { 'If-None-Match': etag } : {}),
            },
        });
        return {
            status: response.status,
            data: response.status === 304 ? null : response.data,
            etag: typeof response.headers.etag === 'string' ? response.headers.etag : null,
        };
    }
    async postMessage(apiBaseUrl, accessToken, payload) {
        const res = await this.http.post(`${apiBaseUrl}/gateway/messages`, payload, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        return res.data;
    }
    async postHeartbeat(apiBaseUrl, accessToken, payload) {
        const res = await this.http.post(`${apiBaseUrl}/gateway/heartbeat`, payload, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        return res.data;
    }
    parsePositiveInt(rawValue, fallback) {
        const parsed = Number.parseInt(rawValue || '', 10);
        if (!Number.isFinite(parsed) || parsed <= 0)
            return fallback;
        return parsed;
    }
}
exports.CloudClient = CloudClient;
