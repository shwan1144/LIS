"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrintServer = void 0;
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const pdf_to_printer_1 = require("pdf-to-printer");
require("dotenv/config");
const SERVICE_NAME = 'lis-print-gateway';
const DEFAULT_PORT = 17881;
const MAX_REQUEST_BYTES = 40 * 1024 * 1024;
const SUMATRA_BINARY_NAME = 'SumatraPDF-3.4.6-32.exe';
class HttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.name = 'HttpError';
        this.statusCode = statusCode;
    }
}
function parsePort(value) {
    const parsed = Number.parseInt(value ?? '', 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
        return parsed;
    }
    return DEFAULT_PORT;
}
class PrintServer {
    constructor(onEvent, version = 'unknown') {
        this.port = parsePort(process.env.PORT);
        this.startedAt = new Date().toISOString();
        this.tempSumatraPath = path_1.default.join(os_1.default.tmpdir(), SERVICE_NAME, SUMATRA_BINARY_NAME);
        this.server = null;
        this.onEvent = onEvent;
        this.version = version;
    }
    async getStatusSnapshot() {
        let printers = [];
        try {
            printers = await this.listPrinters();
        }
        catch {
            printers = [];
        }
        return {
            port: this.port,
            printerCount: printers.length,
            printers,
            service: SERVICE_NAME,
            startedAt: this.startedAt,
            status: 'ok',
            version: this.version,
        };
    }
    start() {
        if (this.server) {
            this.log(`Gateway already running on port ${this.port}.`);
            return;
        }
        this.ensureSumatraBinary();
        this.server = http_1.default.createServer((req, res) => {
            void this.handleRequest(req, res);
        });
        this.server.on('error', (error) => {
            this.log(`Gateway server error: ${error.message}`, 'error');
        });
        this.server.listen(this.port, () => {
            this.log(`Gateway listening on http://localhost:${this.port}`, 'success');
            void this.notifyStatus();
        });
    }
    stop() {
        if (!this.server) {
            return;
        }
        const activeServer = this.server;
        this.server = null;
        activeServer.close(() => {
            this.log('Gateway server stopped.');
        });
    }
    async handlePrintRequest(res, payload) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new HttpError(400, 'Request body must be a JSON object.');
        }
        const body = payload;
        const jobName = this.normalizeOptionalText(body.jobName, 'jobName') ?? 'LIS Print Job';
        const requestedPrinterName = this.normalizeOptionalText(body.printerName, 'printerName');
        const pdfBuffer = this.decodeBase64Pdf(body.pdfBase64);
        const printerName = await this.resolvePrinterName(requestedPrinterName);
        const tempDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), `${SERVICE_NAME}-`));
        const tempFilePath = path_1.default.join(tempDir, `${(0, crypto_1.randomUUID)()}.pdf`);
        this.log(`Print request received for ${jobName}${printerName ? ` on ${printerName}` : ' on default printer'}.`);
        try {
            fs_1.default.writeFileSync(tempFilePath, pdfBuffer);
            const options = {};
            if (printerName) {
                options.printer = printerName;
            }
            if (fs_1.default.existsSync(this.tempSumatraPath)) {
                options.sumatraPdfPath = this.tempSumatraPath;
            }
            await (0, pdf_to_printer_1.print)(tempFilePath, options);
            this.log(`Printed ${jobName}${printerName ? ` on ${printerName}` : ''}.`, 'success');
            this.respondJson(res, 200, {
                jobName,
                printerName: printerName ?? null,
                status: 'success',
            });
            void this.notifyStatus();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Print failed.';
            this.log(`Print failed: ${message}`, 'error');
            throw new HttpError(500, message);
        }
        finally {
            setTimeout(() => {
                fs_1.default.rmSync(tempDir, { force: true, recursive: true });
            }, 10000);
        }
    }
    async handleRequest(req, res) {
        this.applyCorsHeaders(res);
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        try {
            const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`);
            if (req.method === 'GET' && url.pathname === '/local/status') {
                this.respondJson(res, 200, await this.getStatusSnapshot());
                return;
            }
            if (req.method === 'GET' && url.pathname === '/local/printers') {
                const printers = await this.listPrinters();
                this.respondJson(res, 200, { printers });
                return;
            }
            if (req.method === 'POST' && url.pathname === '/local/print') {
                const payload = await this.readJsonBody(req);
                await this.handlePrintRequest(res, payload);
                return;
            }
            throw new HttpError(404, 'Route not found.');
        }
        catch (error) {
            const statusCode = error instanceof HttpError ? error.statusCode : 500;
            const message = error instanceof Error ? error.message : 'Unexpected gateway error.';
            if (statusCode >= 500) {
                this.log(message, 'error');
            }
            this.respondJson(res, statusCode, {
                error: message,
                message,
            });
        }
    }
    applyCorsHeaders(res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    decodeBase64Pdf(value) {
        const raw = this.normalizeRequiredText(value, 'pdfBase64');
        const withoutPrefix = raw.replace(/^data:application\/pdf;base64,/i, '');
        const normalized = withoutPrefix.replace(/\s+/g, '');
        if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) {
            throw new HttpError(400, 'pdfBase64 must contain base64-encoded PDF data.');
        }
        const buffer = Buffer.from(normalized, 'base64');
        if (buffer.length === 0) {
            throw new HttpError(400, 'pdfBase64 could not be decoded.');
        }
        const fileSignature = buffer.subarray(0, 4).toString('ascii');
        if (fileSignature !== '%PDF') {
            throw new HttpError(400, 'pdfBase64 must contain a valid PDF document.');
        }
        return buffer;
    }
    ensureSumatraBinary() {
        const sourcePath = this.getPossibleSumatraPaths().find((candidate) => fs_1.default.existsSync(candidate));
        if (!sourcePath) {
            this.log('SumatraPDF binary was not found. Gateway printing may fail.', 'error');
            return;
        }
        try {
            fs_1.default.mkdirSync(path_1.default.dirname(this.tempSumatraPath), { recursive: true });
            fs_1.default.copyFileSync(sourcePath, this.tempSumatraPath);
            this.log(`Prepared SumatraPDF at ${this.tempSumatraPath}.`, 'success');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown extraction error.';
            this.log(`Failed to prepare SumatraPDF: ${message}`, 'error');
        }
    }
    getPossibleSumatraPaths() {
        const electronProcess = process;
        const resourcesPath = electronProcess.resourcesPath;
        return [
            path_1.default.join(__dirname, '../node_modules/pdf-to-printer/dist', SUMATRA_BINARY_NAME),
            path_1.default.join(process.cwd(), 'node_modules/pdf-to-printer/dist', SUMATRA_BINARY_NAME),
            path_1.default.join(process.cwd(), 'lis-print-gateway/node_modules/pdf-to-printer/dist', SUMATRA_BINARY_NAME),
            ...(resourcesPath
                ? [
                    path_1.default.join(resourcesPath, 'app.asar.unpacked/node_modules/pdf-to-printer/dist', SUMATRA_BINARY_NAME),
                    path_1.default.join(resourcesPath, 'node_modules/pdf-to-printer/dist', SUMATRA_BINARY_NAME),
                ]
                : []),
        ];
    }
    async listPrinters() {
        const printers = await (0, pdf_to_printer_1.getPrinters)();
        return Array.from(new Set(printers
            .map((printer) => printer.name.trim())
            .filter((printerName) => printerName.length > 0))).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
    }
    log(text, type = 'info') {
        const timestamp = new Date().toISOString();
        const message = {
            text,
            timestamp,
            type,
        };
        console.log(`[Gateway:${type}] ${text}`);
        this.onEvent({ data: message, type: 'log' });
    }
    normalizeOptionalText(value, fieldName) {
        if (value == null) {
            return undefined;
        }
        if (typeof value !== 'string') {
            throw new HttpError(400, `${fieldName} must be a string.`);
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
    normalizeRequiredText(value, fieldName) {
        const normalized = this.normalizeOptionalText(value, fieldName);
        if (!normalized) {
            throw new HttpError(400, `${fieldName} is required.`);
        }
        return normalized;
    }
    async notifyStatus() {
        this.onEvent({ data: await this.getStatusSnapshot(), type: 'status' });
    }
    async readJsonBody(req) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            let receivedBytes = 0;
            let settled = false;
            req.on('data', (chunk) => {
                if (settled) {
                    return;
                }
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                receivedBytes += buffer.length;
                if (receivedBytes > MAX_REQUEST_BYTES) {
                    settled = true;
                    reject(new HttpError(413, 'Request body exceeded the 40 MB limit.'));
                    return;
                }
                chunks.push(buffer);
            });
            req.on('end', () => {
                if (settled) {
                    return;
                }
                const rawBody = Buffer.concat(chunks).toString('utf8').trim();
                if (!rawBody) {
                    reject(new HttpError(400, 'Request body is required.'));
                    return;
                }
                try {
                    resolve(JSON.parse(rawBody));
                }
                catch {
                    reject(new HttpError(400, 'Request body must be valid JSON.'));
                }
            });
            req.on('aborted', () => {
                if (settled) {
                    return;
                }
                settled = true;
                reject(new HttpError(400, 'Request was aborted before completion.'));
            });
            req.on('error', (error) => {
                if (settled) {
                    return;
                }
                settled = true;
                reject(error);
            });
        });
    }
    respondJson(res, statusCode, payload) {
        if (res.writableEnded) {
            return;
        }
        res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(payload));
    }
    async resolvePrinterName(requestedPrinterName) {
        if (!requestedPrinterName) {
            return undefined;
        }
        const printers = await this.listPrinters();
        const normalizedRequest = requestedPrinterName.toLocaleLowerCase();
        const exactMatch = printers.find((printerName) => printerName.toLocaleLowerCase() === normalizedRequest);
        if (exactMatch) {
            return exactMatch;
        }
        const containsMatch = printers.find((printerName) => {
            const normalizedPrinterName = printerName.toLocaleLowerCase();
            return (normalizedPrinterName.includes(normalizedRequest) ||
                normalizedRequest.includes(normalizedPrinterName));
        });
        if (containsMatch) {
            return containsMatch;
        }
        throw new HttpError(400, `Printer "${requestedPrinterName}" was not found on this machine.`);
    }
}
exports.PrintServer = PrintServer;
