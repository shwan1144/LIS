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
const serialport_1 = require("serialport");
const logger_1 = require("./logger");
const ASTM_ENQ = 0x05;
const ASTM_ACK = 0x06;
const ASTM_NAK = 0x15;
const ASTM_EOT = 0x04;
const ASTM_STX = 0x02;
const ASTM_ETX = 0x03;
const ASTM_ETB = 0x17;
const ASCII_LF = 0x0a;
const ASCII_CR = 0x0d;
function parseHl7FramedMessages(buffer, startBlock, endBlock) {
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
function normalizeAstmInput(raw) {
    return raw
        .replace(/\r\n/g, '\r')
        .replace(/\n/g, '\r')
        .replace(/\x00/g, '');
}
function findAstmHeaderStart(value) {
    for (let i = 0; i < value.length - 1; i += 1) {
        if (value[i] === 'H' && value[i + 1] === '|')
            return i;
        if (i < value.length - 2 && /\d/.test(value[i]) && value[i + 1] === 'H' && value[i + 2] === '|') {
            return i;
        }
    }
    return -1;
}
function findAstmMessageEnd(value) {
    for (let i = 0; i < value.length - 1; i += 1) {
        const lineStart = i === 0 || value[i - 1] === '\r';
        if (!lineStart)
            continue;
        const startsWithL = value[i] === 'L' && value[i + 1] === '|';
        const startsWithFrameAndL = i < value.length - 2 &&
            /\d/.test(value[i]) &&
            value[i + 1] === 'L' &&
            value[i + 2] === '|';
        if (!startsWithL && !startsWithFrameAndL)
            continue;
        const lineBreakIndex = value.indexOf('\r', i);
        if (lineBreakIndex === -1)
            return -1;
        let end = lineBreakIndex + 1;
        while (end < value.length && (value[end] === '\r' || value[end] === '\n' || value[end] === '\x04')) {
            end += 1;
        }
        return end;
    }
    return -1;
}
function extractAstmMessages(buffer) {
    const messages = [];
    let remaining = normalizeAstmInput(buffer);
    while (true) {
        const headerStart = findAstmHeaderStart(remaining);
        if (headerStart === -1) {
            if (remaining.length > 65535)
                remaining = remaining.slice(-65535);
            break;
        }
        if (headerStart > 0) {
            remaining = remaining.slice(headerStart);
        }
        const endIndex = findAstmMessageEnd(remaining);
        if (endIndex === -1)
            break;
        const message = remaining.slice(0, endIndex).trim();
        if (message)
            messages.push(message);
        remaining = remaining.slice(endIndex);
    }
    return { messages, remaining };
}
function checksumFrame(frame) {
    let sum = 0;
    for (const value of frame) {
        sum = (sum + value) % 256;
    }
    return sum;
}
function parityForSerialPort(parity) {
    const normalized = parity.trim().toUpperCase();
    if (normalized === 'EVEN')
        return 'even';
    if (normalized === 'ODD')
        return 'odd';
    return 'none';
}
function parityToShortCode(parity) {
    const normalized = parity.trim().toUpperCase();
    if (normalized === 'EVEN')
        return 'E';
    if (normalized === 'ODD')
        return 'O';
    return 'N';
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
        return Array.from(this.listeners.values()).map((runtime) => {
            if (runtime.kind === 'TCP') {
                return {
                    instrumentId: runtime.config.instrumentId,
                    state: runtime.state,
                    name: runtime.config.name,
                    transport: 'TCP',
                    endpoint: `TCP:${runtime.config.port}`,
                    port: runtime.config.port,
                    lastError: runtime.lastError,
                    protocol: runtime.config.protocol,
                    connectionType: runtime.config.connectionType,
                };
            }
            return {
                instrumentId: runtime.config.instrumentId,
                state: runtime.state,
                name: runtime.config.name,
                transport: 'SERIAL',
                endpoint: `SERIAL ${runtime.config.serialPort}@${runtime.config.baudRate},${runtime.config.dataBits}${parityToShortCode(runtime.config.parity)}${runtime.config.stopBits}`,
                lastError: runtime.lastError,
                protocol: runtime.config.protocol,
                connectionType: runtime.config.connectionType,
            };
        });
    }
    startListener(config) {
        if (config.connectionType === 'SERIAL') {
            this.startSerialListener(config);
            return;
        }
        this.startTcpListener(config);
    }
    startTcpListener(config) {
        const runtime = {
            kind: 'TCP',
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
                const framed = parseHl7FramedMessages(buffer, config.hl7StartBlock, config.hl7EndBlock);
                buffer = framed.remaining;
                for (const message of framed.messages) {
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
    startSerialListener(config) {
        const dataBits = Number.parseInt(config.dataBits, 10);
        const stopBits = Number.parseInt(config.stopBits, 10);
        const serial = new serialport_1.SerialPort({
            path: config.serialPort,
            baudRate: config.baudRate,
            dataBits: dataBits === 7 ? 7 : 8,
            stopBits: stopBits === 2 ? 2 : 1,
            parity: parityForSerialPort(config.parity),
            autoOpen: false,
        });
        const runtime = {
            kind: 'SERIAL',
            config,
            serial,
            retryTimer: null,
            stopping: false,
            state: 'OFFLINE',
            lastError: null,
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
            this.setSerialError(runtime, `Serial error on ${config.serialPort}: ${error.message}`);
            this.scheduleSerialRetry(runtime);
        });
        serial.on('close', () => {
            if (runtime.stopping)
                return;
            this.setSerialError(runtime, `Serial listener closed on ${config.serialPort}`);
            this.scheduleSerialRetry(runtime);
        });
        this.listeners.set(config.instrumentId, runtime);
        this.openSerialPort(runtime);
    }
    openSerialPort(runtime) {
        if (runtime.stopping || runtime.serial.isOpen)
            return;
        runtime.serial.open((error) => {
            if (runtime.stopping)
                return;
            if (error) {
                this.setSerialError(runtime, `Failed to open serial ${runtime.config.serialPort}: ${error.message}`);
                this.scheduleSerialRetry(runtime);
                return;
            }
            runtime.state = 'ONLINE';
            runtime.lastError = null;
            logger_1.logger.log(`ASTM serial listener active on ${runtime.config.serialPort} @ ${runtime.config.baudRate} (${runtime.config.dataBits}${parityToShortCode(runtime.config.parity)}${runtime.config.stopBits}) for ${runtime.config.name} (${runtime.config.instrumentId})`, 'Listener');
        });
    }
    consumeSerialChunk(runtime, chunk) {
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
    consumeAstmFrame(runtime, frame) {
        if (frame.length < 7 || frame[0] !== ASTM_STX)
            return false;
        const controlIndex = frame.findIndex((value, index) => index >= 2 && (value === ASTM_ETX || value === ASTM_ETB));
        if (controlIndex === -1 || controlIndex + 4 > frame.length) {
            return false;
        }
        const checksumChars = String.fromCharCode(frame[controlIndex + 1] || 0) +
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
    flushFramedPayload(runtime) {
        const extracted = extractAstmMessages(runtime.astm.framedPayload);
        runtime.astm.framedPayload = extracted.remaining;
        for (const message of extracted.messages) {
            this.emitAstmMessage(runtime, message);
        }
    }
    emitAstmMessage(runtime, message) {
        logger_1.logger.log(`Received ASTM message (${message.length} bytes) from ${runtime.config.name} on ${runtime.config.serialPort}`, 'Serial');
        this.onMessage({
            instrumentId: runtime.config.instrumentId,
            rawMessage: message,
            protocolHint: 'ASTM',
        });
    }
    sendSerialControl(runtime, controlByte) {
        if (!runtime.serial.isOpen)
            return;
        runtime.serial.write(Buffer.from([controlByte]), (error) => {
            if (error) {
                this.setSerialError(runtime, `Failed writing serial control byte: ${error.message}`);
            }
        });
    }
    scheduleSerialRetry(runtime) {
        if (runtime.stopping || runtime.retryTimer)
            return;
        runtime.retryTimer = setTimeout(() => {
            runtime.retryTimer = null;
            if (runtime.stopping)
                return;
            this.openSerialPort(runtime);
        }, 5000);
    }
    setSerialError(runtime, message) {
        runtime.state = 'ERROR';
        runtime.lastError = message;
        logger_1.logger.error(message, 'Serial');
    }
    stopListener(instrumentId, runtime) {
        if (runtime.kind === 'TCP') {
            try {
                runtime.server.close();
            }
            catch {
                // Ignore close race.
            }
        }
        else {
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
        logger_1.logger.log(`Stopped listener for ${runtime.config.name} (${instrumentId})`, 'Listener');
    }
    isSameBinding(current, next) {
        if (current.connectionType !== next.connectionType)
            return false;
        if (current.protocol !== next.protocol)
            return false;
        if (current.enabled !== next.enabled)
            return false;
        if (current.connectionType === 'TCP_SERVER' && next.connectionType === 'TCP_SERVER') {
            return (current.port === next.port &&
                current.hl7StartBlock === next.hl7StartBlock &&
                current.hl7EndBlock === next.hl7EndBlock);
        }
        if (current.connectionType === 'SERIAL' && next.connectionType === 'SERIAL') {
            return (current.serialPort === next.serialPort &&
                current.baudRate === next.baudRate &&
                current.dataBits === next.dataBits &&
                current.parity === next.parity &&
                current.stopBits === next.stopBits);
        }
        return false;
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
