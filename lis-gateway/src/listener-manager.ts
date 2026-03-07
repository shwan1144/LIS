import * as net from 'net';
import { spawnSync } from 'child_process';
import { logger } from './logger';

export interface ManagedInstrumentListenerConfig {
  instrumentId: string;
  name: string;
  port: number;
  hl7StartBlock: string;
  hl7EndBlock: string;
  enabled: boolean;
}

export interface ListenerStatusView {
  instrumentId: string;
  state: 'OFFLINE' | 'ONLINE' | 'ERROR';
  port: number;
  name: string;
  lastError: string | null;
}

interface ListenerRuntime {
  config: ManagedInstrumentListenerConfig;
  server: net.Server;
  state: ListenerStatusView['state'];
  lastError: string | null;
}

function parseFramedMessages(
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

export class ListenerManager {
  private readonly listeners = new Map<string, ListenerRuntime>();

  constructor(
    private readonly onMessage: (input: {
      instrumentId: string;
      rawMessage: string;
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

    for (const [instrumentId, runtime] of this.listeners.entries()) {
      const next = nextMap.get(instrumentId);
      if (!next || !this.isSameBinding(runtime.config, next)) {
        this.stopListener(instrumentId, runtime);
      }
    }

    for (const [instrumentId, cfg] of nextMap.entries()) {
      if (this.listeners.has(instrumentId)) continue;
      this.startListener(cfg);
    }
  }

  stopAll(): void {
    for (const [instrumentId, runtime] of this.listeners.entries()) {
      this.stopListener(instrumentId, runtime);
    }
  }

  getStatus(): ListenerStatusView[] {
    return Array.from(this.listeners.values()).map((runtime) => ({
      instrumentId: runtime.config.instrumentId,
      state: runtime.state,
      port: runtime.config.port,
      name: runtime.config.name,
      lastError: runtime.lastError,
    }));
  }

  private startListener(config: ManagedInstrumentListenerConfig): void {
    const runtime: ListenerRuntime = {
      config,
      server: net.createServer(),
      state: 'OFFLINE',
      lastError: null,
    };

    runtime.server.on('connection', (socket) => {
      runtime.state = 'ONLINE';
      runtime.lastError = null;
      logger.log(
        `Instrument ${config.name} connected from ${socket.remoteAddress || 'unknown'}`,
        `TCP:${config.port}`,
      );

      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const framed = parseFramedMessages(buffer, config.hl7StartBlock, config.hl7EndBlock);
        buffer = framed.remaining;

        for (const message of framed.messages) {
          this.onMessage({
            instrumentId: config.instrumentId,
            rawMessage: message,
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

  private stopListener(instrumentId: string, runtime: ListenerRuntime): void {
    try {
      runtime.server.close();
    } catch {
      // Ignore close race.
    }
    this.listeners.delete(instrumentId);
    logger.log(
      `Stopped listener for ${runtime.config.name} (${instrumentId})`,
      'Listener',
    );
  }

  private isSameBinding(
    current: ManagedInstrumentListenerConfig,
    next: ManagedInstrumentListenerConfig,
  ): boolean {
    return (
      current.port === next.port &&
      current.hl7StartBlock === next.hl7StartBlock &&
      current.hl7EndBlock === next.hl7EndBlock &&
      current.enabled === next.enabled
    );
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
