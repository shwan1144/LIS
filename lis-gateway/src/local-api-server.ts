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
  ) {}

  start(): void {
    if (this.server) return;

    this.server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

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
