import * as net from 'net';
import { spawnSync } from 'child_process';
import { SerialPort } from 'serialport';
import { logger } from './logger';

const ASTM_ENQ = 0x05;
const ASTM_ACK = 0x06;
const ASTM_NAK = 0x15;
const ASTM_EOT = 0x04;
const ASTM_STX = 0x02;
const ASTM_ETX = 0x03;
const ASTM_ETB = 0x17;
const ASCII_LF = 0x0a;
const ASCII_CR = 0x0d;

export type ManagedInstrumentListenerConfig =
  | {
      instrumentId: string;
      name: string;
      protocol: 'HL7_V2';
      connectionType: 'TCP_SERVER';
      enabled: boolean;
      port: number;
      hl7StartBlock: string;
      hl7EndBlock: string;
    }
  | {
      instrumentId: string;
      name: string;
      protocol: 'ASTM';
      connectionType: 'SERIAL';
      enabled: boolean;
      serialPort: string;
      baudRate: number;
      dataBits: string;
      parity: string;
      stopBits: string;
    };

type TcpManagedInstrumentListenerConfig = Extract<
  ManagedInstrumentListenerConfig,
  { connectionType: 'TCP_SERVER' }
>;

type SerialManagedInstrumentListenerConfig = Extract<
  ManagedInstrumentListenerConfig,
  { connectionType: 'SERIAL' }
>;

export interface ListenerStatusView {
  instrumentId: string;
  state: 'OFFLINE' | 'ONLINE' | 'ERROR';
  listenerState: 'RUNNING' | 'ERROR' | 'STOPPED';
  linkState: 'CONNECTED' | 'WAITING' | 'IDLE' | 'DISCONNECTED';
  instrumentConnected: boolean;
  name: string;
  transport: 'TCP' | 'SERIAL';
  endpoint: string;
  lastError: string | null;
  port?: number;
  protocol: string;
  connectionType: string;
  lastMessageAt: string | null;
  messagesReceived: number;
  activeConnections?: number;
}

interface BaseListenerRuntime<TConfig extends ManagedInstrumentListenerConfig> {
  config: TConfig;
  state: ListenerStatusView['state'];
  lastError: string | null;
  messagesReceived: number;
  lastMessageAtMs: number | null;
  lastByteAtMs: number | null;
}

interface TcpRuntime extends BaseListenerRuntime<TcpManagedInstrumentListenerConfig> {
  kind: 'TCP';
  server: net.Server;
  activeConnections: number;
}

interface SerialAstmState {
  inFrame: boolean;
  frameBytes: number[];
  framedPayload: string;
  streamPayload: string;
}

interface SerialRuntime extends BaseListenerRuntime<SerialManagedInstrumentListenerConfig> {
  kind: 'SERIAL';
  serial: SerialPort;
  retryTimer: NodeJS.Timeout | null;
  stopping: boolean;
  astm: SerialAstmState;
}

type ListenerRuntime = TcpRuntime | SerialRuntime;

function parseHl7FramedMessages(
  buffer: string,
  startBlock: string,
  endBlock: string,
): { messages: string[]; remaining: string } {
  const messages: string[] = [];
  let working = buffer;

  while (true) {
    const startIndex = working.indexOf(startBlock);
    if (startIndex < 0) break;
    const endIndex = working.indexOf(endBlock, startIndex + startBlock.length);
    if (endIndex < 0) break;
    messages.push(working.slice(startIndex + startBlock.length, endIndex));
    working = working.slice(endIndex + endBlock.length);
  }

  return { messages, remaining: working };
}

function normalizeAstmInput(raw: string): string {
  return raw
    .replace(/\r\n/g, '\r')
    .replace(/\n/g, '\r')
    .replace(/\x00/g, '');
}

function findAstmHeaderStart(value: string): number {
  for (let i = 0; i < value.length - 1; i += 1) {
    if (value[i] === 'H' && value[i + 1] === '|') return i;
    if (i < value.length - 2 && /\d/.test(value[i]) && value[i + 1] === 'H' && value[i + 2] === '|') {
      return i;
    }
  }
  return -1;
}

function findAstmMessageEnd(value: string): number {
  for (let i = 0; i < value.length - 1; i += 1) {
    const lineStart = i === 0 || value[i - 1] === '\r';
    if (!lineStart) continue;

    const startsWithL = value[i] === 'L' && value[i + 1] === '|';
    const startsWithFrameAndL =
      i < value.length - 2 &&
      /\d/.test(value[i]) &&
      value[i + 1] === 'L' &&
      value[i + 2] === '|';
    if (!startsWithL && !startsWithFrameAndL) continue;

    const lineBreakIndex = value.indexOf('\r', i);
    if (lineBreakIndex === -1) return -1;

    let end = lineBreakIndex + 1;
    while (end < value.length && (value[end] === '\r' || value[end] === '\n' || value[end] === '\x04')) {
      end += 1;
    }
    return end;
  }
  return -1;
}

function extractAstmMessages(buffer: string): { messages: string[]; remaining: string } {
  const messages: string[] = [];
  let remaining = normalizeAstmInput(buffer);

  while (true) {
    const headerStart = findAstmHeaderStart(remaining);
    if (headerStart === -1) {
      if (remaining.length > 65535) remaining = remaining.slice(-65535);
      break;
    }

    if (headerStart > 0) {
      remaining = remaining.slice(headerStart);
    }

    const endIndex = findAstmMessageEnd(remaining);
    if (endIndex === -1) break;

    const message = remaining.slice(0, endIndex).trim();
    if (message) messages.push(message);
    remaining = remaining.slice(endIndex);
  }

  return { messages, remaining };
}

function checksumFrame(frame: number[]): number {
  let sum = 0;
  for (const value of frame) {
    sum = (sum + value) % 256;
  }
  return sum;
}

function parityForSerialPort(parity: string): 'none' | 'even' | 'odd' {
  const normalized = parity.trim().toUpperCase();
  if (normalized === 'EVEN') return 'even';
  if (normalized === 'ODD') return 'odd';
  return 'none';
}

function parityToShortCode(parity: string): string {
  const normalized = parity.trim().toUpperCase();
  if (normalized === 'EVEN') return 'E';
  if (normalized === 'ODD') return 'O';
  return 'N';
}

export class ListenerManager {
  private readonly listeners = new Map<string, ListenerRuntime>();
  private readonly blockedStatuses = new Map<string, ListenerStatusView>();

  constructor(
    private readonly onMessage: (input: {
      instrumentId: string;
      rawMessage: string;
      protocolHint: 'HL7_V2' | 'ASTM';
      remoteAddress?: string;
      remotePort?: number;
    }) => void,
  ) {}

  applyConfig(configs: ManagedInstrumentListenerConfig[]): void {
    const nextMap = new Map<string, ManagedInstrumentListenerConfig>();
    for (const cfg of configs) {
      if (!cfg.enabled) continue;
      nextMap.set(cfg.instrumentId, cfg);
    }
    const conflicts = this.detectConfigConflicts(Array.from(nextMap.values()));

    for (const [instrumentId, runtime] of this.listeners.entries()) {
      const next = nextMap.get(instrumentId);
      if (!next || conflicts.has(instrumentId) || !this.isSameBinding(runtime.config, next)) {
        this.stopListener(instrumentId, runtime);
      }
    }

    this.blockedStatuses.clear();
    for (const [instrumentId, message] of conflicts.entries()) {
      const cfg = nextMap.get(instrumentId);
      if (!cfg) continue;
      const endpoint =
        cfg.connectionType === 'TCP_SERVER'
          ? `TCP:${cfg.port}`
          : `SERIAL ${cfg.serialPort}@${cfg.baudRate},${cfg.dataBits}${parityToShortCode(cfg.parity)}${cfg.stopBits}`;
      this.blockedStatuses.set(instrumentId, {
        instrumentId,
        state: 'ERROR',
        listenerState: 'ERROR',
        linkState: 'DISCONNECTED',
        instrumentConnected: false,
        name: cfg.name,
        transport: cfg.connectionType === 'TCP_SERVER' ? 'TCP' : 'SERIAL',
        endpoint,
        lastError: message,
        port: cfg.connectionType === 'TCP_SERVER' ? cfg.port : undefined,
        protocol: cfg.protocol,
        connectionType: cfg.connectionType,
        lastMessageAt: null,
        messagesReceived: 0,
        activeConnections: cfg.connectionType === 'TCP_SERVER' ? 0 : undefined,
      });
      logger.error(
        `Listener config rejected for ${cfg.name} (${instrumentId}): ${message}`,
        'Listener',
      );
    }

    for (const [instrumentId, cfg] of nextMap.entries()) {
      if (conflicts.has(instrumentId)) continue;
      if (this.listeners.has(instrumentId)) continue;
      this.startListener(cfg);
    }
  }

  stopAll(): void {
    for (const [instrumentId, runtime] of this.listeners.entries()) {
      this.stopListener(instrumentId, runtime);
    }
    this.blockedStatuses.clear();
  }

  getStatus(): ListenerStatusView[] {
    const runtimeStatuses = Array.from(this.listeners.values()).map<ListenerStatusView>((runtime) => {
      const listenerState = this.toListenerState(runtime);
      const linkState = this.toLinkState(runtime);
      if (runtime.kind === 'TCP') {
        return {
          instrumentId: runtime.config.instrumentId,
          state: runtime.state,
          listenerState,
          linkState,
          instrumentConnected: linkState === 'CONNECTED',
          name: runtime.config.name,
          transport: 'TCP',
          endpoint: `TCP:${runtime.config.port}`,
          port: runtime.config.port,
          lastError: runtime.lastError,
          protocol: runtime.config.protocol,
          connectionType: runtime.config.connectionType,
          lastMessageAt: runtime.lastMessageAtMs ? new Date(runtime.lastMessageAtMs).toISOString() : null,
          messagesReceived: runtime.messagesReceived,
          activeConnections: runtime.activeConnections,
        };
      }

      return {
        instrumentId: runtime.config.instrumentId,
        state: runtime.state,
        listenerState,
        linkState,
        instrumentConnected: linkState === 'CONNECTED',
        name: runtime.config.name,
        transport: 'SERIAL',
        endpoint: `SERIAL ${runtime.config.serialPort}@${runtime.config.baudRate},${runtime.config.dataBits}${parityToShortCode(runtime.config.parity)}${runtime.config.stopBits}`,
        lastError: runtime.lastError,
        protocol: runtime.config.protocol,
        connectionType: runtime.config.connectionType,
        lastMessageAt: runtime.lastMessageAtMs ? new Date(runtime.lastMessageAtMs).toISOString() : null,
        messagesReceived: runtime.messagesReceived,
      };
    });

    const blocked = Array.from(this.blockedStatuses.values());
    return [...runtimeStatuses, ...blocked].sort((a, b) => a.name.localeCompare(b.name));
  }

  private startListener(config: ManagedInstrumentListenerConfig): void {
    if (config.connectionType === 'SERIAL') {
      this.startSerialListener(config);
      return;
    }
    this.startTcpListener(config);
  }

  private startTcpListener(config: TcpManagedInstrumentListenerConfig): void {
    const runtime: TcpRuntime = {
      kind: 'TCP',
      config,
      server: net.createServer(),
      state: 'OFFLINE',
      lastError: null,
      messagesReceived: 0,
      lastMessageAtMs: null,
      lastByteAtMs: null,
      activeConnections: 0,
    };

    runtime.server.on('connection', (socket) => {
      runtime.state = 'ONLINE';
      runtime.lastError = null;
      runtime.activeConnections += 1;
      logger.log(
        `Instrument ${config.name} connected from ${socket.remoteAddress || 'unknown'}`,
        `TCP:${config.port}`,
      );

      let buffer = '';
      socket.on('data', (chunk) => {
        this.markByteReceived(runtime);
        buffer += chunk.toString();
        const framed = parseHl7FramedMessages(buffer, config.hl7StartBlock, config.hl7EndBlock);
        buffer = framed.remaining;

        for (const message of framed.messages) {
          this.markMessageReceived(runtime);
          this.onMessage({
            instrumentId: config.instrumentId,
            rawMessage: message,
            protocolHint: 'HL7_V2',
            remoteAddress: socket.remoteAddress || undefined,
            remotePort: socket.remotePort || undefined,
          });
        }
      });

      socket.on('error', (error) => {
        runtime.state = 'ERROR';
        runtime.lastError = error.message;
        logger.error(
          `Socket error for ${config.name} on ${config.port}: ${error.message}`,
          `TCP:${config.port}`,
        );
      });

      let closed = false;
      const markClosed = () => {
        if (closed) return;
        closed = true;
        runtime.activeConnections = Math.max(0, runtime.activeConnections - 1);
        if (runtime.activeConnections === 0 && runtime.state !== 'ERROR') {
          runtime.state = 'ONLINE';
        }
      };
      socket.on('close', markClosed);
      socket.on('end', markClosed);
    });

    runtime.server.on('error', (error) => {
      runtime.state = 'ERROR';
      runtime.lastError = error.message;
      logger.error(
        `Listener error for ${config.name} on ${config.port}: ${error.message}`,
        `TCP:${config.port}`,
      );
    });

    this.ensureFirewallPortRule(config.port);

    runtime.server.listen(config.port, '0.0.0.0', () => {
      runtime.state = 'ONLINE';
      runtime.lastError = null;
      logger.log(
        `HL7 TCP listener active on port ${config.port} for ${config.name} (${config.instrumentId})`,
        'Listener',
      );
    });

    this.listeners.set(config.instrumentId, runtime);
  }

  private startSerialListener(config: SerialManagedInstrumentListenerConfig): void {
    const dataBits = Number.parseInt(config.dataBits, 10);
    const stopBits = Number.parseInt(config.stopBits, 10);

    const serial = new SerialPort({
      path: config.serialPort,
      baudRate: config.baudRate,
      dataBits: dataBits === 7 ? 7 : 8,
      stopBits: stopBits === 2 ? 2 : 1,
      parity: parityForSerialPort(config.parity),
      autoOpen: false,
    });

    const runtime: SerialRuntime = {
      kind: 'SERIAL',
      config,
      serial,
      retryTimer: null,
      stopping: false,
      state: 'OFFLINE',
      lastError: null,
      messagesReceived: 0,
      lastMessageAtMs: null,
      lastByteAtMs: null,
      astm: {
        inFrame: false,
        frameBytes: [],
        framedPayload: '',
        streamPayload: '',
      },
    };

    serial.on('data', (chunk) => {
      this.consumeSerialChunk(runtime, chunk);
    });

    serial.on('error', (error) => {
      this.setSerialError(
        runtime,
        `Serial error on ${config.serialPort}: ${error.message}`,
      );
      this.scheduleSerialRetry(runtime);
    });

    serial.on('close', () => {
      if (runtime.stopping) return;
      this.setSerialError(runtime, `Serial listener closed on ${config.serialPort}`);
      this.scheduleSerialRetry(runtime);
    });

    this.listeners.set(config.instrumentId, runtime);
    this.openSerialPort(runtime);
  }

  private openSerialPort(runtime: SerialRuntime): void {
    if (runtime.stopping || runtime.serial.isOpen) return;
    runtime.serial.open((error) => {
      if (runtime.stopping) return;
      if (error) {
        this.setSerialError(
          runtime,
          `Failed to open serial ${runtime.config.serialPort}: ${error.message}`,
        );
        this.scheduleSerialRetry(runtime);
        return;
      }

      runtime.state = 'ONLINE';
      runtime.lastError = null;
      logger.log(
        `ASTM serial listener active on ${runtime.config.serialPort} @ ${runtime.config.baudRate} (${runtime.config.dataBits}${parityToShortCode(runtime.config.parity)}${runtime.config.stopBits}) for ${runtime.config.name} (${runtime.config.instrumentId})`,
        'Listener',
      );
    });
  }

  private consumeSerialChunk(runtime: SerialRuntime, chunk: Buffer): void {
    this.markByteReceived(runtime);
    for (const byte of chunk.values()) {
      if (byte === ASTM_ENQ) {
        runtime.astm.inFrame = false;
        runtime.astm.frameBytes = [];
        runtime.astm.framedPayload = '';
        this.sendSerialControl(runtime, ASTM_ACK);
        continue;
      }

      if (byte === ASTM_EOT) {
        this.flushFramedPayload(runtime);
        continue;
      }

      if (byte === ASTM_STX) {
        runtime.astm.inFrame = true;
        runtime.astm.frameBytes = [byte];
        continue;
      }

      if (runtime.astm.inFrame) {
        runtime.astm.frameBytes.push(byte);
        if (byte === ASCII_LF) {
          const accepted = this.consumeAstmFrame(runtime, runtime.astm.frameBytes);
          this.sendSerialControl(runtime, accepted ? ASTM_ACK : ASTM_NAK);
          runtime.astm.inFrame = false;
          runtime.astm.frameBytes = [];
        }
        continue;
      }

      if (byte === ASTM_ACK || byte === ASTM_NAK) {
        continue;
      }

      runtime.astm.streamPayload += Buffer.from([byte]).toString('latin1');
      if (runtime.astm.streamPayload.length > 65535) {
        runtime.astm.streamPayload = runtime.astm.streamPayload.slice(-65535);
      }

      const extracted = extractAstmMessages(runtime.astm.streamPayload);
      runtime.astm.streamPayload = extracted.remaining;
      for (const message of extracted.messages) {
        this.emitAstmMessage(runtime, message);
      }
    }
  }

  private consumeAstmFrame(runtime: SerialRuntime, frame: number[]): boolean {
    if (frame.length < 7 || frame[0] !== ASTM_STX) return false;

    const controlIndex = frame.findIndex(
      (value, index) => index >= 2 && (value === ASTM_ETX || value === ASTM_ETB),
    );
    if (controlIndex === -1 || controlIndex + 4 > frame.length) {
      return false;
    }

    const checksumChars =
      String.fromCharCode(frame[controlIndex + 1] || 0) +
      String.fromCharCode(frame[controlIndex + 2] || 0);
    if (!/^[0-9A-Fa-f]{2}$/.test(checksumChars)) {
      return false;
    }

    const expectedChecksum = Number.parseInt(checksumChars, 16);
    const actualChecksum = checksumFrame(frame.slice(1, controlIndex + 1));
    if (expectedChecksum !== actualChecksum) {
      return false;
    }

    const text = Buffer.from(frame.slice(2, controlIndex)).toString('latin1');
    runtime.astm.framedPayload += `${text}\r`;

    const extracted = extractAstmMessages(runtime.astm.framedPayload);
    runtime.astm.framedPayload = extracted.remaining;
    for (const message of extracted.messages) {
      this.emitAstmMessage(runtime, message);
    }

    return true;
  }

  private flushFramedPayload(runtime: SerialRuntime): void {
    const extracted = extractAstmMessages(runtime.astm.framedPayload);
    runtime.astm.framedPayload = extracted.remaining;
    for (const message of extracted.messages) {
      this.emitAstmMessage(runtime, message);
    }
  }

  private emitAstmMessage(runtime: SerialRuntime, message: string): void {
    this.markMessageReceived(runtime);
    logger.log(
      `Received ASTM message (${message.length} bytes) from ${runtime.config.name} on ${runtime.config.serialPort}`,
      'Serial',
    );
    this.onMessage({
      instrumentId: runtime.config.instrumentId,
      rawMessage: message,
      protocolHint: 'ASTM',
    });
  }

  private sendSerialControl(runtime: SerialRuntime, controlByte: number): void {
    if (!runtime.serial.isOpen) return;
    runtime.serial.write(Buffer.from([controlByte]), (error) => {
      if (error) {
        this.setSerialError(runtime, `Failed writing serial control byte: ${error.message}`);
      }
    });
  }

  private scheduleSerialRetry(runtime: SerialRuntime): void {
    if (runtime.stopping || runtime.retryTimer) return;
    runtime.retryTimer = setTimeout(() => {
      runtime.retryTimer = null;
      if (runtime.stopping) return;
      this.openSerialPort(runtime);
    }, 5000);
  }

  private setSerialError(runtime: SerialRuntime, message: string): void {
    runtime.state = 'ERROR';
    runtime.lastError = message;
    logger.error(message, 'Serial');
  }

  private stopListener(instrumentId: string, runtime: ListenerRuntime): void {
    if (runtime.kind === 'TCP') {
      try {
        runtime.server.close();
      } catch {
        // Ignore close race.
      }
    } else {
      runtime.stopping = true;
      if (runtime.retryTimer) {
        clearTimeout(runtime.retryTimer);
        runtime.retryTimer = null;
      }
      runtime.serial.removeAllListeners();
      if (runtime.serial.isOpen) {
        runtime.serial.close();
      }
    }

    this.listeners.delete(instrumentId);
    logger.log(
      `Stopped listener for ${runtime.config.name} (${instrumentId})`,
      'Listener',
    );
  }

  private markByteReceived(runtime: ListenerRuntime): void {
    runtime.lastByteAtMs = Date.now();
  }

  private markMessageReceived(runtime: ListenerRuntime): void {
    const now = Date.now();
    runtime.lastByteAtMs = now;
    runtime.lastMessageAtMs = now;
    runtime.messagesReceived += 1;
  }

  private toListenerState(runtime: ListenerRuntime): ListenerStatusView['listenerState'] {
    if (runtime.state === 'ERROR') return 'ERROR';
    if (runtime.state === 'ONLINE') return 'RUNNING';
    return 'STOPPED';
  }

  private toLinkState(runtime: ListenerRuntime): ListenerStatusView['linkState'] {
    if (runtime.state === 'ERROR') return 'DISCONNECTED';
    if (runtime.state !== 'ONLINE') return 'DISCONNECTED';

    if (runtime.kind === 'TCP') {
      if (runtime.activeConnections > 0) return 'CONNECTED';
      if (runtime.messagesReceived === 0) return 'WAITING';
      return 'IDLE';
    }

    if (!runtime.serial.isOpen) return 'DISCONNECTED';
    const now = Date.now();
    if (runtime.lastByteAtMs && now - runtime.lastByteAtMs <= 30000) {
      return 'CONNECTED';
    }
    if (runtime.messagesReceived === 0) {
      return 'WAITING';
    }
    return 'IDLE';
  }

  private detectConfigConflicts(
    configs: ManagedInstrumentListenerConfig[],
  ): Map<string, string> {
    const conflicts = new Map<string, string>();
    const tcpByPort = new Map<number, string[]>();
    const serialByPort = new Map<string, string[]>();

    for (const cfg of configs) {
      if (cfg.connectionType === 'TCP_SERVER') {
        const list = tcpByPort.get(cfg.port) || [];
        list.push(cfg.instrumentId);
        tcpByPort.set(cfg.port, list);
        continue;
      }

      const serialKey = cfg.serialPort.trim().toUpperCase();
      const list = serialByPort.get(serialKey) || [];
      list.push(cfg.instrumentId);
      serialByPort.set(serialKey, list);
    }

    for (const [port, instrumentIds] of tcpByPort.entries()) {
      if (instrumentIds.length <= 1) continue;
      for (const instrumentId of instrumentIds) {
        conflicts.set(
          instrumentId,
          `Configuration conflict: TCP port ${port} is assigned to multiple instruments`,
        );
      }
    }

    for (const [serialPort, instrumentIds] of serialByPort.entries()) {
      if (instrumentIds.length <= 1) continue;
      for (const instrumentId of instrumentIds) {
        conflicts.set(
          instrumentId,
          `Configuration conflict: serial port ${serialPort} is assigned to multiple instruments`,
        );
      }
    }

    return conflicts;
  }

  private isSameBinding(
    current: ManagedInstrumentListenerConfig,
    next: ManagedInstrumentListenerConfig,
  ): boolean {
    if (current.connectionType !== next.connectionType) return false;
    if (current.protocol !== next.protocol) return false;
    if (current.enabled !== next.enabled) return false;

    if (current.connectionType === 'TCP_SERVER' && next.connectionType === 'TCP_SERVER') {
      return (
        current.port === next.port &&
        current.hl7StartBlock === next.hl7StartBlock &&
        current.hl7EndBlock === next.hl7EndBlock
      );
    }

    if (current.connectionType === 'SERIAL' && next.connectionType === 'SERIAL') {
      return (
        current.serialPort === next.serialPort &&
        current.baudRate === next.baudRate &&
        current.dataBits === next.dataBits &&
        current.parity === next.parity &&
        current.stopBits === next.stopBits
      );
    }

    return false;
  }

  private ensureFirewallPortRule(port: number): void {
    if (process.platform !== 'win32') return;
    const ruleName = `LISGateway TCP ${port}`;
    try {
      spawnSync(
        'netsh',
        [
          'advfirewall',
          'firewall',
          'add',
          'rule',
          `name=${ruleName}`,
          'dir=in',
          'action=allow',
          'protocol=TCP',
          `localport=${port}`,
        ],
        { stdio: 'ignore' },
      );
    } catch (error) {
      logger.warn(
        `Unable to ensure firewall rule for port ${port}: ${error instanceof Error ? error.message : String(error)}`,
        'Firewall',
      );
    }
  }
}
