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
exports.ListenerManager = void 0;
const net = __importStar(require("net"));
const child_process_1 = require("child_process");
const logger_1 = require("./logger");
function parseFramedMessages(buffer, startBlock, endBlock) {
    const messages = [];
    let working = buffer;
    while (true) {
        const startIndex = working.indexOf(startBlock);
        if (startIndex < 0)
            break;
        const endIndex = working.indexOf(endBlock, startIndex + startBlock.length);
        if (endIndex < 0)
            break;
        messages.push(working.slice(startIndex + startBlock.length, endIndex));
        working = working.slice(endIndex + endBlock.length);
    }
    return { messages, remaining: working };
}
class ListenerManager {
    onMessage;
    listeners = new Map();
    constructor(onMessage) {
        this.onMessage = onMessage;
    }
    applyConfig(configs) {
        const nextMap = new Map();
        for (const cfg of configs) {
            if (!cfg.enabled)
                continue;
            nextMap.set(cfg.instrumentId, cfg);
        }
        for (const [instrumentId, runtime] of this.listeners.entries()) {
            const next = nextMap.get(instrumentId);
            if (!next || !this.isSameBinding(runtime.config, next)) {
                this.stopListener(instrumentId, runtime);
            }
        }
        for (const [instrumentId, cfg] of nextMap.entries()) {
            if (this.listeners.has(instrumentId))
                continue;
            this.startListener(cfg);
        }
    }
    stopAll() {
        for (const [instrumentId, runtime] of this.listeners.entries()) {
            this.stopListener(instrumentId, runtime);
        }
    }
    getStatus() {
        return Array.from(this.listeners.values()).map((runtime) => ({
            instrumentId: runtime.config.instrumentId,
            state: runtime.state,
            port: runtime.config.port,
            name: runtime.config.name,
            lastError: runtime.lastError,
        }));
    }
    startListener(config) {
        const runtime = {
            config,
            server: net.createServer(),
            state: 'OFFLINE',
            lastError: null,
        };
        runtime.server.on('connection', (socket) => {
            runtime.state = 'ONLINE';
            runtime.lastError = null;
            logger_1.logger.log(`Instrument ${config.name} connected from ${socket.remoteAddress || 'unknown'}`, `TCP:${config.port}`);
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
                logger_1.logger.error(`Socket error for ${config.name} on ${config.port}: ${error.message}`, `TCP:${config.port}`);
            });
        });
        runtime.server.on('error', (error) => {
            runtime.state = 'ERROR';
            runtime.lastError = error.message;
            logger_1.logger.error(`Listener error for ${config.name} on ${config.port}: ${error.message}`, `TCP:${config.port}`);
        });
        this.ensureFirewallPortRule(config.port);
        runtime.server.listen(config.port, '0.0.0.0', () => {
            runtime.state = 'ONLINE';
            runtime.lastError = null;
            logger_1.logger.log(`HL7 TCP listener active on port ${config.port} for ${config.name} (${config.instrumentId})`, 'Listener');
        });
        this.listeners.set(config.instrumentId, runtime);
    }
    stopListener(instrumentId, runtime) {
        try {
            runtime.server.close();
        }
        catch {
            // Ignore close race.
        }
        this.listeners.delete(instrumentId);
        logger_1.logger.log(`Stopped listener for ${runtime.config.name} (${instrumentId})`, 'Listener');
    }
    isSameBinding(current, next) {
        return (current.port === next.port &&
            current.hl7StartBlock === next.hl7StartBlock &&
            current.hl7EndBlock === next.hl7EndBlock &&
            current.enabled === next.enabled);
    }
    ensureFirewallPortRule(port) {
        if (process.platform !== 'win32')
            return;
        const ruleName = `LISGateway TCP ${port}`;
        try {
            (0, child_process_1.spawnSync)('netsh', [
                'advfirewall',
                'firewall',
                'add',
                'rule',
                `name=${ruleName}`,
                'dir=in',
                'action=allow',
                'protocol=TCP',
                `localport=${port}`,
            ], { stdio: 'ignore' });
        }
        catch (error) {
            logger_1.logger.warn(`Unable to ensure firewall rule for port ${port}: ${error instanceof Error ? error.message : String(error)}`, 'Firewall');
        }
    }
}
exports.ListenerManager = ListenerManager;
