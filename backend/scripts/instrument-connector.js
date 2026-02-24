#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const net = require('net');
const dotenv = require('dotenv');

const CONTROL = {
  VT: '\x0b',
  FS: '\x1c',
  CR: '\x0d',
  EOT: '\x04',
};

const DEFAULTS = {
  protocol: 'AUTO',
  listenHost: '0.0.0.0',
  listenPort: 5001,
  idleFlushMs: 350,
  maxBufferBytes: 2 * 1024 * 1024,
  requestTimeoutMs: 15000,
};

const PLACEHOLDER_INSTRUMENT_ID = /^0{8}-0{4}-0{4}-0{4}-0{12}$/i;
const UUID_V4ISH_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function loadEnv() {
  const explicitPath = process.env.CONNECTOR_ENV_PATH;
  const packagedBase = process.pkg ? path.dirname(process.execPath) : process.cwd();
  const defaultPath = path.resolve(packagedBase, '.env.connector');
  const envPath = explicitPath ? path.resolve(process.cwd(), explicitPath) : defaultPath;
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    log('INFO', `Loaded connector env: ${envPath}`);
  } else {
    dotenv.config();
  }
}

function parseIntEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getConfig(options = {}) {
  const requireInstrumentId = options.requireInstrumentId !== false;
  const baseUrl = (process.env.LIS_BASE_URL || '').trim().replace(/\/+$/, '');
  const username = (process.env.LIS_USERNAME || '').trim();
  const password = process.env.LIS_PASSWORD || '';
  const instrumentId = (process.env.LIS_INSTRUMENT_ID || '').trim();
  const protocol = (process.env.CONNECTOR_PROTOCOL || DEFAULTS.protocol).trim().toUpperCase();
  const listenHost = (process.env.CONNECTOR_LISTEN_HOST || DEFAULTS.listenHost).trim();
  const listenPort = parseIntEnv('CONNECTOR_LISTEN_PORT', DEFAULTS.listenPort);
  const idleFlushMs = parseIntEnv('CONNECTOR_IDLE_FLUSH_MS', DEFAULTS.idleFlushMs);
  const maxBufferBytes = parseIntEnv('CONNECTOR_MAX_BUFFER_BYTES', DEFAULTS.maxBufferBytes);
  const requestTimeoutMs = parseIntEnv('CONNECTOR_REQUEST_TIMEOUT_MS', DEFAULTS.requestTimeoutMs);
  const forwardedHost = (process.env.LIS_FORWARDED_HOST || '').trim();
  const dryRun = String(process.env.CONNECTOR_DRY_RUN || '').toLowerCase() === 'true';

  const errors = [];
  if (!baseUrl) errors.push('LIS_BASE_URL is required');
  if (!username) errors.push('LIS_USERNAME is required');
  if (!password) errors.push('LIS_PASSWORD is required');
  if (requireInstrumentId && !instrumentId) errors.push('LIS_INSTRUMENT_ID is required');
  if (requireInstrumentId && PLACEHOLDER_INSTRUMENT_ID.test(instrumentId)) {
    errors.push('LIS_INSTRUMENT_ID is still placeholder (all zeros). Use a real instrument UUID from LIS Settings > Instruments');
  }
  if (requireInstrumentId && instrumentId && !UUID_V4ISH_REGEX.test(instrumentId)) {
    errors.push(
      `LIS_INSTRUMENT_ID must be a valid UUID (36 chars like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx). Received: "${instrumentId}"`,
    );
  }
  if (!['AUTO', 'HL7', 'ASTM'].includes(protocol)) {
    errors.push('CONNECTOR_PROTOCOL must be one of AUTO | HL7 | ASTM');
  }
  if (!Number.isFinite(listenPort) || listenPort <= 0 || listenPort > 65535) {
    errors.push('CONNECTOR_LISTEN_PORT must be a valid port (1-65535)');
  }
  if (!Number.isFinite(idleFlushMs) || idleFlushMs < 50) {
    errors.push('CONNECTOR_IDLE_FLUSH_MS must be >= 50');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid connector configuration:\n- ${errors.join('\n- ')}`);
  }

  return {
    baseUrl,
    username,
    password,
    instrumentId,
    protocol,
    listenHost,
    listenPort,
    idleFlushMs,
    maxBufferBytes,
    requestTimeoutMs,
    forwardedHost,
    dryRun,
  };
}

function now() {
  return new Date().toISOString();
}

function log(level, message, meta) {
  if (meta !== undefined) {
    console.log(`[${now()}] [${level}] ${message}`, meta);
    return;
  }
  console.log(`[${now()}] [${level}] ${message}`);
}

function isHtmlResponseBody(body) {
  if (typeof body !== 'string') return false;
  const normalized = body.trim().toLowerCase();
  return normalized.startsWith('<!doctype html') || normalized.startsWith('<html');
}

async function postJson(url, body, headers = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      body: json ?? text,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url, headers = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...headers,
      },
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      body: json ?? text,
    };
  } finally {
    clearTimeout(timer);
  }
}

class LisSession {
  constructor(config) {
    this.config = config;
    this.accessToken = null;
  }

  getTenantHeaders() {
    if (!this.config.forwardedHost) return {};
    const origin = `https://${this.config.forwardedHost}`;
    return {
      'x-forwarded-host': this.config.forwardedHost,
      'x-forwarded-proto': 'https',
      origin,
      referer: `${origin}/`,
    };
  }

  async login() {
    const url = `${this.config.baseUrl}/auth/login`;
    const headers = this.getTenantHeaders();
    const res = await postJson(
      url,
      { username: this.config.username, password: this.config.password },
      headers,
      this.config.requestTimeoutMs,
    );
    if (isHtmlResponseBody(res.body)) {
      throw new Error(
        'Login returned HTML page instead of JSON. ' +
        'LIS_BASE_URL is pointing to frontend, not backend API. ' +
        'Set LIS_BASE_URL to backend host (example: https://api.medilis.net) ' +
        'and set LIS_FORWARDED_HOST to your lab host (example: lab01.medilis.net).',
      );
    }
    if (!res.ok || !res.body || typeof res.body !== 'object') {
      throw new Error(`Login failed (${res.status}): ${JSON.stringify(res.body)}`);
    }
    const token = res.body.accessToken;
    if (!token || typeof token !== 'string') {
      throw new Error('Login succeeded but accessToken is missing');
    }
    this.accessToken = token;
    log('INFO', 'Connector authenticated successfully');
    return token;
  }

  async sendRaw(rawMessage) {
    if (this.config.dryRun) {
      log('INFO', `DRY RUN: message length=${rawMessage.length}`);
      return { success: true, dryRun: true };
    }
    if (!this.accessToken) {
      await this.login();
    }
    const url = `${this.config.baseUrl}/instruments/${this.config.instrumentId}/simulate`;
    const headers = {
      authorization: `Bearer ${this.accessToken}`,
      ...this.getTenantHeaders(),
    };

    let res = await postJson(
      url,
      { rawMessage },
      headers,
      this.config.requestTimeoutMs,
    );
    if (res.status === 401 || res.status === 403) {
      log('WARN', 'Token rejected by API, re-authenticating...');
      await this.login();
      headers.authorization = `Bearer ${this.accessToken}`;
      res = await postJson(url, { rawMessage }, headers, this.config.requestTimeoutMs);
    }
    if (!res.ok) {
      throw new Error(`Ingest failed (${res.status}): ${JSON.stringify(res.body)}`);
    }
    return res.body;
  }

  authHeaders() {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }
    return {
      authorization: `Bearer ${this.accessToken}`,
      ...this.getTenantHeaders(),
    };
  }

  async getInstrument() {
    const url = `${this.config.baseUrl}/instruments/${this.config.instrumentId}`;
    const res = await getJson(url, this.authHeaders(), this.config.requestTimeoutMs);
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(
          `Instrument not found for LIS_INSTRUMENT_ID=${this.config.instrumentId}. ` +
          'Open LIS Settings > Instruments and copy the real UUID.',
        );
      }
      throw new Error(`Instrument lookup failed (${res.status}): ${JSON.stringify(res.body)}`);
    }
    return res.body;
  }

  async listInstruments() {
    const url = `${this.config.baseUrl}/instruments`;
    const res = await getJson(url, this.authHeaders(), this.config.requestTimeoutMs);
    if (!res.ok) {
      throw new Error(`List instruments failed (${res.status}): ${JSON.stringify(res.body)}`);
    }
    const items = Array.isArray(res.body) ? res.body : [];
    return items;
  }
}

function normalizeOutgoingMessage(raw, protocol) {
  if (!raw) return '';
  let msg = raw;

  // Remove HL7 MLLP framing when present.
  if (protocol === 'HL7' || protocol === 'AUTO') {
    msg = msg.replace(/^\x0b/, '').replace(/\x1c\x0d?$/, '');
  }

  // Normalize line endings to CR for parser compatibility.
  msg = msg.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
  return msg.trim();
}

function extractHl7Messages(buffer) {
  const complete = [];
  let remaining = buffer;
  while (true) {
    const start = remaining.indexOf(CONTROL.VT);
    if (start < 0) break;
    const end = remaining.indexOf(CONTROL.FS + CONTROL.CR, start);
    if (end < 0) break;
    const message = remaining.slice(start, end + 2);
    complete.push(message);
    remaining = remaining.slice(end + 2);
  }
  return { complete, remaining };
}

function extractAstmMessages(buffer) {
  const complete = [];
  let remaining = buffer;
  while (true) {
    const end = remaining.indexOf(CONTROL.EOT);
    if (end < 0) break;
    const message = remaining.slice(0, end + 1);
    complete.push(message);
    remaining = remaining.slice(end + 1);
  }
  return { complete, remaining };
}

function extractMessages(buffer, protocol) {
  let remaining = buffer;
  const complete = [];

  if (protocol === 'HL7') {
    const hl7 = extractHl7Messages(remaining);
    complete.push(...hl7.complete);
    remaining = hl7.remaining;
    return { complete, remaining };
  }

  if (protocol === 'ASTM') {
    const astm = extractAstmMessages(remaining);
    complete.push(...astm.complete);
    remaining = astm.remaining;
    return { complete, remaining };
  }

  // AUTO: HL7 first (framed), then ASTM.
  const hl7 = extractHl7Messages(remaining);
  complete.push(...hl7.complete);
  remaining = hl7.remaining;

  const astm = extractAstmMessages(remaining);
  complete.push(...astm.complete);
  remaining = astm.remaining;

  return { complete, remaining };
}

function safePreview(message) {
  const clean = message.replace(/[^\x20-\x7E\r\n]/g, '').replace(/\s+/g, ' ').trim();
  return clean.length > 120 ? `${clean.slice(0, 120)}...` : clean;
}

async function startConnector(config, session) {
  const server = net.createServer((socket) => {
    const remote = `${socket.remoteAddress || 'unknown'}:${socket.remotePort || '0'}`;
    let buffer = '';
    let idleTimer = null;

    const flushRemaining = async (reason) => {
      const trimmed = buffer.trim();
      buffer = '';
      if (!trimmed) return;
      log('WARN', `Flushing partial message due to ${reason} from ${remote}`);
      const normalized = normalizeOutgoingMessage(trimmed, config.protocol);
      if (!normalized) return;
      try {
        await session.sendRaw(normalized);
        log('INFO', `Partial forwarded (${reason}) preview="${safePreview(normalized)}"`);
      } catch (error) {
        log('ERROR', `Partial forward failed (${reason}): ${error.message}`);
      }
    };

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        void flushRemaining('idle-timeout');
      }, config.idleFlushMs);
    };

    socket.on('data', (chunk) => {
      const text = Buffer.from(chunk).toString('latin1');
      buffer += text;
      if (buffer.length > config.maxBufferBytes) {
        log('WARN', `Buffer exceeded ${config.maxBufferBytes} bytes from ${remote}; forcing flush`);
        void flushRemaining('buffer-overflow');
        return;
      }

      const extracted = extractMessages(buffer, config.protocol);
      buffer = extracted.remaining;

      for (const rawMessage of extracted.complete) {
        const normalized = normalizeOutgoingMessage(rawMessage, config.protocol);
        if (!normalized) continue;
        void session
          .sendRaw(normalized)
          .then(() => {
            log('INFO', `Forwarded message from ${remote} preview="${safePreview(normalized)}"`);
          })
          .catch((error) => {
            log('ERROR', `Forward failed from ${remote}: ${error.message}`);
          });
      }
      resetIdleTimer();
    });

    socket.on('error', (error) => {
      log('ERROR', `Socket error from ${remote}: ${error.message}`);
    });

    socket.on('end', () => {
      void flushRemaining('socket-end');
      if (idleTimer) clearTimeout(idleTimer);
    });

    socket.on('close', () => {
      if (idleTimer) clearTimeout(idleTimer);
    });

    log('INFO', `Instrument connection opened from ${remote}`);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.listenPort, config.listenHost, () => resolve());
  });

  log(
    'INFO',
    `Connector listening on ${config.listenHost}:${config.listenPort} protocol=${config.protocol} instrument=${config.instrumentId}`,
  );

  const shutdown = () => {
    log('INFO', 'Stopping connector...');
    server.close(() => {
      log('INFO', 'Connector stopped');
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function runDoctor(config, session) {
  log('INFO', 'Running connector doctor checks...');
  log('INFO', `LIS base URL: ${config.baseUrl}`);
  log('INFO', `Instrument ID: ${config.instrumentId}`);
  log('INFO', `Forwarded host: ${config.forwardedHost || '(none)'}`);
  await session.login();
  const instrument = await session.getInstrument();
  log('INFO', `Instrument resolved: ${instrument?.code || '(no code)'} / ${instrument?.name || '(no name)'}`);
  log('INFO', 'Doctor check passed.');
}

async function runListInstruments(_config, session) {
  log('INFO', 'Listing instruments...');
  await session.login();
  const instruments = await session.listInstruments();
  if (!instruments.length) {
    log('WARN', 'No instruments found for this lab.');
    return;
  }
  const rows = instruments.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    protocol: item.protocol,
    connectionType: item.connectionType,
    active: item.isActive,
  }));
  console.table(rows);
}

function printHelp() {
  console.log(`
LIS Instrument Connector (local Windows bridge)

Usage:
  node scripts/instrument-connector.js
  node scripts/instrument-connector.js --doctor
  node scripts/instrument-connector.js --list-instruments

Environment (.env.connector):
  LIS_BASE_URL=https://lab01.medilis.net
  LIS_USERNAME=instrument.bot
  LIS_PASSWORD=your-password
  LIS_INSTRUMENT_ID=<uuid-from-settings>
  LIS_FORWARDED_HOST=lab01.medilis.net            # optional, needed if using api host
  CONNECTOR_PROTOCOL=AUTO                         # AUTO | HL7 | ASTM
  CONNECTOR_LISTEN_HOST=0.0.0.0
  CONNECTOR_LISTEN_PORT=5001
  CONNECTOR_IDLE_FLUSH_MS=350
  CONNECTOR_MAX_BUFFER_BYTES=2097152
  CONNECTOR_DRY_RUN=false
`);
}

async function main() {
  loadEnv();
  const isListMode = process.argv.includes('--list-instruments');
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }
  const config = getConfig({ requireInstrumentId: !isListMode });
  const session = new LisSession(config);

  if (process.argv.includes('--doctor')) {
    await runDoctor(config, session);
    return;
  }
  if (process.argv.includes('--list-instruments')) {
    await runListInstruments(config, session);
    return;
  }

  await session.login();
  await session.getInstrument();
  await startConnector(config, session);
}

main().catch((error) => {
  log('ERROR', error && error.stack ? error.stack : String(error));
  process.exit(1);
});
