"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudClient = exports.CloudHttpError = void 0;
exports.isCloudHttpError = isCloudHttpError;
class CloudHttpError extends Error {
    status;
    data;
    constructor(status, data, message) {
        super(message);
        this.name = 'CloudHttpError';
        this.status = status;
        this.data = data;
    }
}
exports.CloudHttpError = CloudHttpError;
function isCloudHttpError(error) {
    return error instanceof CloudHttpError;
}
class CloudClient {
    timeoutMs;
    constructor() {
        this.timeoutMs = this.parsePositiveInt(process.env.FORWARD_TIMEOUT_MS, 8000);
    }
    async activate(apiBaseUrl, payload) {
        const res = await this.request(`${apiBaseUrl}/gateway/activate`, {
            method: 'POST',
            headers: this.jsonHeaders(),
            body: JSON.stringify(payload),
        }, []);
        return res.data;
    }
    async refresh(apiBaseUrl, payload) {
        const res = await this.request(`${apiBaseUrl}/gateway/token/refresh`, {
            method: 'POST',
            headers: this.jsonHeaders(),
            body: JSON.stringify(payload),
        }, []);
        return res.data;
    }
    async getConfig(apiBaseUrl, accessToken, etag) {
        const response = await this.request(`${apiBaseUrl}/gateway/config`, {
            method: 'GET',
            headers: {
                ...this.jsonHeaders(),
                Authorization: `Bearer ${accessToken}`,
                ...(etag ? { 'If-None-Match': etag } : {}),
            },
        }, [304]);
        return {
            status: response.status,
            data: response.status === 304 ? null : response.data,
            etag: response.headers.get('etag'),
        };
    }
    async postMessage(apiBaseUrl, accessToken, payload) {
        const res = await this.request(`${apiBaseUrl}/gateway/messages`, {
            method: 'POST',
            headers: {
                ...this.jsonHeaders(),
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
        }, []);
        return res.data;
    }
    async postHeartbeat(apiBaseUrl, accessToken, payload) {
        const res = await this.request(`${apiBaseUrl}/gateway/heartbeat`, {
            method: 'POST',
            headers: {
                ...this.jsonHeaders(),
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
        }, []);
        return res.data;
    }
    parsePositiveInt(rawValue, fallback) {
        const parsed = Number.parseInt(rawValue || '', 10);
        if (!Number.isFinite(parsed) || parsed <= 0)
            return fallback;
        return parsed;
    }
    jsonHeaders() {
        return {
            'Content-Type': 'application/json',
        };
    }
    async request(url, init, allowedStatuses) {
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
        }
        catch (error) {
            if (error instanceof CloudHttpError)
                throw error;
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Request timed out after ${this.timeoutMs}ms`);
            }
            throw error;
        }
        finally {
            clearTimeout(timeoutHandle);
        }
    }
    parseBody(bodyText) {
        if (!bodyText)
            return null;
        try {
            return JSON.parse(bodyText);
        }
        catch {
            return bodyText;
        }
    }
    extractErrorMessage(body) {
        if (!body || typeof body !== 'object')
            return null;
        const source = body;
        if (typeof source.message === 'string' && source.message.trim()) {
            return source.message;
        }
        if (typeof source.error === 'string' && source.error.trim()) {
            return source.error;
        }
        return null;
    }
}
exports.CloudClient = CloudClient;
