import { randomUUID } from 'crypto';
import fs from 'fs';
import http, { IncomingMessage, ServerResponse } from 'http';
import os from 'os';
import path from 'path';
import { getPrinters, print as printPdf, type PrintOptions } from 'pdf-to-printer';
import 'dotenv/config';

const SERVICE_NAME = 'lis-print-gateway';
const DEFAULT_PORT = 17881;
const MAX_REQUEST_BYTES = 40 * 1024 * 1024;
const SUMATRA_BINARY_NAME = 'SumatraPDF-3.4.6-32.exe';

type LogType = 'error' | 'info' | 'success';

export interface GatewayLogMessage {
    text: string;
    timestamp: string;
    type: LogType;
}

export interface PrintRequestBody {
    jobName?: string;
    pdfBase64?: string;
    printerName?: string;
    printOptions?: {
        orientation?: 'portrait' | 'landscape';
        scale?: 'noscale' | 'shrink' | 'fit';
    };
}

export interface ServerStatusSnapshot {
    port: number;
    printerCount: number;
    printers: string[];
    service: string;
    startedAt: string;
    status: 'ok';
    version: string;
}

export interface ServerEvent {
    data: GatewayLogMessage | ServerStatusSnapshot;
    type: 'log' | 'status';
}

type JsonError = {
    error: string;
    message: string;
};

class HttpError extends Error {
    statusCode: number;

    constructor(statusCode: number, message: string) {
        super(message);
        this.name = 'HttpError';
        this.statusCode = statusCode;
    }
}

function parsePort(value: string | undefined): number {
    const parsed = Number.parseInt(value ?? '', 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
        return parsed;
    }

    return DEFAULT_PORT;
}

export class PrintServer {
    private readonly onEvent: (event: ServerEvent) => void;

    private readonly port = parsePort(process.env.PORT);

    private readonly startedAt = new Date().toISOString();

    private readonly tempSumatraPath = path.join(os.tmpdir(), SERVICE_NAME, SUMATRA_BINARY_NAME);

    private readonly version: string;

    private server: http.Server | null = null;

    constructor(onEvent: (event: ServerEvent) => void, version = 'unknown') {
        this.onEvent = onEvent;
        this.version = version;
    }

    async getStatusSnapshot(): Promise<ServerStatusSnapshot> {
        let printers: string[] = [];

        try {
            printers = await this.listPrinters();
        } catch {
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

    start(): void {
        if (this.server) {
            this.log(`Gateway already running on port ${this.port}.`);
            return;
        }

        this.ensureSumatraBinary();

        this.server = http.createServer((req, res) => {
            void this.handleRequest(req, res);
        });

        this.server.on('error', (error: Error) => {
            this.log(`Gateway server error: ${error.message}`, 'error');
        });

        this.server.listen(this.port, () => {
            this.log(`Gateway listening on http://localhost:${this.port}`, 'success');
            void this.notifyStatus();
        });
    }

    stop(): void {
        if (!this.server) {
            return;
        }

        const activeServer = this.server;
        this.server = null;

        activeServer.close(() => {
            this.log('Gateway server stopped.');
        });
    }

    private async handlePrintRequest(res: ServerResponse, payload: unknown): Promise<void> {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new HttpError(400, 'Request body must be a JSON object.');
        }

        const body = payload as PrintRequestBody;
        const jobName = this.normalizeOptionalText(body.jobName, 'jobName') ?? 'LIS Print Job';
        const requestedPrinterName = this.normalizeOptionalText(body.printerName, 'printerName');
        const pdfBuffer = this.decodeBase64Pdf(body.pdfBase64);
        const printerName = await this.resolvePrinterName(requestedPrinterName);
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${SERVICE_NAME}-`));
        const tempFilePath = path.join(tempDir, `${randomUUID()}.pdf`);

        this.log(
            `Print request received for ${jobName}${printerName ? ` on ${printerName}` : ' on default printer'}.`,
        );

        try {
            fs.writeFileSync(tempFilePath, pdfBuffer);

            const options: PrintOptions = {};
            if (printerName) {
                options.printer = printerName;
            }
            this.applyRequestedPrintOptions(body.printOptions, options);
            if (fs.existsSync(this.tempSumatraPath)) {
                options.sumatraPdfPath = this.tempSumatraPath;
            }

            await printPdf(tempFilePath, options);

            this.log(`Printed ${jobName}${printerName ? ` on ${printerName}` : ''}.`, 'success');
            this.respondJson(res, 200, {
                jobName,
                printerName: printerName ?? null,
                status: 'success',
            });
            void this.notifyStatus();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Print failed.';
            this.log(`Print failed: ${message}`, 'error');
            throw new HttpError(500, message);
        } finally {
            setTimeout(() => {
                fs.rmSync(tempDir, { force: true, recursive: true });
            }, 10_000);
        }
    }

    private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
        } catch (error) {
            const statusCode = error instanceof HttpError ? error.statusCode : 500;
            const message = error instanceof Error ? error.message : 'Unexpected gateway error.';

            if (statusCode >= 500) {
                this.log(message, 'error');
            }

            this.respondJson(res, statusCode, {
                error: message,
                message,
            } satisfies JsonError);
        }
    }

    private applyCorsHeaders(res: ServerResponse): void {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    private decodeBase64Pdf(value: unknown): Buffer {
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

    private ensureSumatraBinary(): void {
        const sourcePath = this.getPossibleSumatraPaths().find((candidate) => fs.existsSync(candidate));
        if (!sourcePath) {
            this.log('SumatraPDF binary was not found. Gateway printing may fail.', 'error');
            return;
        }

        try {
            fs.mkdirSync(path.dirname(this.tempSumatraPath), { recursive: true });
            fs.copyFileSync(sourcePath, this.tempSumatraPath);
            this.log(`Prepared SumatraPDF at ${this.tempSumatraPath}.`, 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown extraction error.';
            this.log(`Failed to prepare SumatraPDF: ${message}`, 'error');
        }
    }

    private getPossibleSumatraPaths(): string[] {
        const electronProcess = process as NodeJS.Process & { resourcesPath?: string };
        const resourcesPath = electronProcess.resourcesPath;

        return [
            path.join(__dirname, '../node_modules/pdf-to-printer/dist', SUMATRA_BINARY_NAME),
            path.join(process.cwd(), 'node_modules/pdf-to-printer/dist', SUMATRA_BINARY_NAME),
            path.join(process.cwd(), 'lis-print-gateway/node_modules/pdf-to-printer/dist', SUMATRA_BINARY_NAME),
            ...(resourcesPath
                ? [
                    path.join(
                        resourcesPath,
                        'app.asar.unpacked/node_modules/pdf-to-printer/dist',
                        SUMATRA_BINARY_NAME,
                    ),
                    path.join(resourcesPath, 'node_modules/pdf-to-printer/dist', SUMATRA_BINARY_NAME),
                ]
                : []),
        ];
    }

    private async listPrinters(): Promise<string[]> {
        const printers = await getPrinters();

        return Array.from(
            new Set(
                printers
                    .map((printer) => printer.name.trim())
                    .filter((printerName) => printerName.length > 0),
            ),
        ).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
    }

    private log(text: string, type: LogType = 'info'): void {
        const timestamp = new Date().toISOString();
        const message: GatewayLogMessage = {
            text,
            timestamp,
            type,
        };

        console.log(`[Gateway:${type}] ${text}`);
        this.onEvent({ data: message, type: 'log' });
    }

    private normalizeOptionalText(value: unknown, fieldName: string): string | undefined {
        if (value == null) {
            return undefined;
        }
        if (typeof value !== 'string') {
            throw new HttpError(400, `${fieldName} must be a string.`);
        }

        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }

    private normalizeRequiredText(value: unknown, fieldName: string): string {
        const normalized = this.normalizeOptionalText(value, fieldName);
        if (!normalized) {
            throw new HttpError(400, `${fieldName} is required.`);
        }

        return normalized;
    }

    private async notifyStatus(): Promise<void> {
        this.onEvent({ data: await this.getStatusSnapshot(), type: 'status' });
    }

    private applyRequestedPrintOptions(
        value: PrintRequestBody['printOptions'],
        options: PrintOptions,
    ): void {
        if (value == null) {
            return;
        }
        if (typeof value !== 'object' || Array.isArray(value)) {
            throw new HttpError(400, 'printOptions must be an object.');
        }

        const orientation = this.normalizeOptionalText(value.orientation, 'printOptions.orientation');
        if (orientation) {
            if (orientation !== 'portrait' && orientation !== 'landscape') {
                throw new HttpError(
                    400,
                    'printOptions.orientation must be portrait or landscape.',
                );
            }
            options.orientation = orientation;
        }

        const scale = this.normalizeOptionalText(value.scale, 'printOptions.scale');
        if (scale) {
            if (scale !== 'noscale' && scale !== 'shrink' && scale !== 'fit') {
                throw new HttpError(
                    400,
                    'printOptions.scale must be noscale, shrink, or fit.',
                );
            }
            options.scale = scale;
        }
    }

    private async readJsonBody(req: IncomingMessage): Promise<unknown> {
        return new Promise<unknown>((resolve, reject) => {
            const chunks: Buffer[] = [];
            let receivedBytes = 0;
            let settled = false;

            req.on('data', (chunk: Buffer | string) => {
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
                    resolve(JSON.parse(rawBody) as unknown);
                } catch {
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

            req.on('error', (error: Error) => {
                if (settled) {
                    return;
                }

                settled = true;
                reject(error);
            });
        });
    }

    private respondJson(res: ServerResponse, statusCode: number, payload: object): void {
        if (res.writableEnded) {
            return;
        }

        res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(payload));
    }

    private async resolvePrinterName(requestedPrinterName: string | undefined): Promise<string | undefined> {
        if (!requestedPrinterName) {
            return undefined;
        }

        const printers = await this.listPrinters();
        const normalizedRequest = requestedPrinterName.toLocaleLowerCase();
        const exactMatch = printers.find(
            (printerName) => printerName.toLocaleLowerCase() === normalizedRequest,
        );
        if (exactMatch) {
            return exactMatch;
        }

        const containsMatch = printers.find((printerName) => {
            const normalizedPrinterName = printerName.toLocaleLowerCase();
            return (
                normalizedPrinterName.includes(normalizedRequest) ||
                normalizedRequest.includes(normalizedPrinterName)
            );
        });
        if (containsMatch) {
            return containsMatch;
        }

        throw new HttpError(400, `Printer "${requestedPrinterName}" was not found on this machine.`);
    }
}
