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
exports.LocalApiServer = void 0;
const http = __importStar(require("http"));
const url_1 = require("url");
const logger_1 = require("./logger");
function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString();
            if (body.length > 1024 * 1024) {
                reject(new Error('Body too large'));
            }
        });
        req.on('end', () => {
            if (!body.trim()) {
                resolve({});
                return;
            }
            try {
                const parsed = JSON.parse(body);
                resolve(parsed);
            }
            catch {
                reject(new Error('Invalid JSON body'));
            }
        });
    });
}
function sendJson(res, statusCode, body) {
    const payload = JSON.stringify(body);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
}
class LocalApiServer {
    authToken;
    facade;
    port;
    server = null;
    constructor(authToken, facade, port) {
        this.authToken = authToken;
        this.facade = facade;
        this.port = port;
    }
    start() {
        if (this.server)
            return;
        this.server = http.createServer(async (req, res) => {
            try {
                const url = new url_1.URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
                if (!this.isAuthorized(req)) {
                    sendJson(res, 401, { error: 'Unauthorized local API request' });
                    return;
                }
                if (req.method === 'GET' && url.pathname === '/local/status') {
                    sendJson(res, 200, await this.facade.getStatus());
                    return;
                }
                if (req.method === 'POST' && url.pathname === '/local/activate') {
                    const body = await parseJsonBody(req);
                    const activationCode = String(body.activationCode || '').trim();
                    const deviceName = String(body.deviceName || '').trim();
                    const apiBaseUrlRaw = String(body.apiBaseUrl || '').trim();
                    if (!activationCode || !deviceName) {
                        sendJson(res, 400, { error: 'activationCode and deviceName are required' });
                        return;
                    }
                    const result = await this.facade.activate({
                        activationCode,
                        deviceName,
                        apiBaseUrl: apiBaseUrlRaw || undefined,
                    });
                    sendJson(res, 200, result);
                    return;
                }
                if (req.method === 'POST' && url.pathname === '/local/sync-now') {
                    sendJson(res, 200, await this.facade.syncNow());
                    return;
                }
                if (req.method === 'GET' && url.pathname === '/local/logs') {
                    const limitRaw = parseInt(url.searchParams.get('limit') || '200', 10);
                    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 200;
                    sendJson(res, 200, { items: this.facade.getLogs(limit) });
                    return;
                }
                if (req.method === 'GET' && url.pathname === '/local/config-view') {
                    sendJson(res, 200, this.facade.getConfigView());
                    return;
                }
                if (req.method === 'GET' && url.pathname === '/local/serial/ports') {
                    sendJson(res, 200, await this.facade.listSerialPorts());
                    return;
                }
                if (req.method === 'POST' && url.pathname === '/local/serial/test-open') {
                    const body = await parseJsonBody(req);
                    const serialPort = String(body.serialPort || '').trim();
                    if (!serialPort) {
                        sendJson(res, 400, { error: 'serialPort is required' });
                        return;
                    }
                    const result = await this.facade.testSerialOpen({
                        serialPort,
                        baudRate: Number(body.baudRate) || undefined,
                        dataBits: body.dataBits ? String(body.dataBits) : undefined,
                        parity: body.parity ? String(body.parity) : undefined,
                        stopBits: body.stopBits ? String(body.stopBits) : undefined,
                        timeoutMs: Number(body.timeoutMs) || undefined,
                    });
                    sendJson(res, 200, result);
                    return;
                }
                if (req.method === 'GET' && url.pathname === '/local/printers') {
                    sendJson(res, 200, { printers: await this.facade.listPrinters() });
                    return;
                }
                if (req.method === 'POST' && url.pathname === '/local/print') {
                    const body = await parseJsonBody(req);
                    const printerName = String(body.printerName || '').trim();
                    const pdfBase64 = String(body.pdfBase64 || '').trim();
                    const jobName = String(body.jobName || '').trim();
                    if (!printerName || !pdfBase64) {
                        sendJson(res, 400, { error: 'printerName and pdfBase64 are required' });
                        return;
                    }
                    const result = await this.facade.print({
                        printerName,
                        pdfBase64,
                        jobName: jobName || undefined,
                    });
                    sendJson(res, 200, result);
                    return;
                }
                sendJson(res, 404, { error: 'Endpoint not found' });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger_1.logger.error(`Local API failure: ${message}`, 'LocalAPI');
                sendJson(res, 500, { error: message });
            }
        });
        this.server.listen(this.port, '127.0.0.1', () => {
            logger_1.logger.log(`Local control API listening on http://127.0.0.1:${this.port}`, 'LocalAPI');
        });
    }
    stop() {
        if (!this.server)
            return;
        this.server.close();
        this.server = null;
    }
    isAuthorized(req) {
        const auth = String(req.headers.authorization || '');
        if (!auth.startsWith('Bearer '))
            return false;
        return auth.slice('Bearer '.length).trim() === this.authToken;
    }
}
exports.LocalApiServer = LocalApiServer;
