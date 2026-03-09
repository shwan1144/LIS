import * as http from 'http';
import { URL } from 'url';
import { logger } from './logger';

interface LocalControlFacade {
  getStatus(): Promise<Record<string, unknown>> | Record<string, unknown>;
  activate(input: {
    activationCode: string;
    deviceName: string;
    apiBaseUrl?: string;
  }): Promise<Record<string, unknown>>;
  syncNow(): Promise<Record<string, unknown>>;
  getConfigView(): Record<string, unknown>;
  getLogs(limit: number): string[];
  listSerialPorts(): Promise<{ ports: Array<Record<string, unknown>> }>;
  testSerialOpen(input: {
    serialPort: string;
    baudRate?: number;
    dataBits?: string;
    parity?: string;
    stopBits?: string;
    timeoutMs?: number;
  }): Promise<Record<string, unknown>>;
  listPrinters(): Promise<string[]>;
  print(input: {
    printerName: string;
    pdfBase64: string;
    jobName?: string;
  }): Promise<Record<string, unknown>>;
}

function parseJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
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
        const parsed = JSON.parse(body) as Record<string, unknown>;
        resolve(parsed);
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export class LocalApiServer {
  private server: http.Server | null = null;

  constructor(
    private readonly authToken: string,
    private readonly facade: LocalControlFacade,
    private readonly port: number,
  ) { }

  start(): void {
    if (this.server) return;

    this.server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

        // Add Basic CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const isPrintingEndpoint =
          url.pathname === '/local/printers' || url.pathname === '/local/print';

        if (!isPrintingEndpoint && !this.isAuthorized(req)) {
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Local API failure: ${message}`, 'LocalAPI');
        sendJson(res, 500, { error: message });
      }
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      logger.log(`Local control API listening on http://127.0.0.1:${this.port}`, 'LocalAPI');
    });
  }

  stop(): void {
    if (!this.server) return;
    this.server.close();
    this.server = null;
  }

  private isAuthorized(req: http.IncomingMessage): boolean {
    const auth = String(req.headers.authorization || '');
    if (!auth.startsWith('Bearer ')) return false;
    return auth.slice('Bearer '.length).trim() === this.authToken;
  }
}
