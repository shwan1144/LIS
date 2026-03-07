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
exports.TCPListener = void 0;
const net = __importStar(require("net"));
const logger_1 = require("../logger");
class TCPListener {
    port;
    instrumentId;
    outbox;
    server = null;
    constructor(port, instrumentId, outbox) {
        this.port = port;
        this.instrumentId = instrumentId;
        this.outbox = outbox;
    }
    start() {
        this.server = net.createServer((socket) => {
            logger_1.logger.log(`Instrument connected: ${socket.remoteAddress}`, `TCP:${this.port}`);
            let buffer = '';
            socket.on('data', (data) => {
                buffer += data.toString();
                // Simple HL7 MLLP extraction
                const startBlock = '\x0b';
                const endBlock = '\x1c\x0d';
                while (true) {
                    const startIndex = buffer.indexOf(startBlock);
                    if (startIndex === -1)
                        break;
                    const endIndex = buffer.indexOf(endBlock, startIndex);
                    if (endIndex === -1)
                        break;
                    const message = buffer.substring(startIndex + startBlock.length, endIndex);
                    logger_1.logger.log(`Received HL7 message (${message.length} bytes)`, `TCP:${this.port}`);
                    try {
                        this.outbox.enqueue({
                            instrumentId: this.instrumentId,
                            rawMessage: message,
                            protocolHint: 'HL7_V2',
                        });
                    }
                    catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        logger_1.logger.error(`Failed to enqueue message for ${this.instrumentId}: ${errorMsg}`, `TCP:${this.port}`);
                    }
                    buffer = buffer.substring(endIndex + endBlock.length);
                }
            });
            socket.on('error', (err) => {
                logger_1.logger.error(`Socket error: ${err.message}`, `TCP:${this.port}`);
            });
            socket.on('close', () => {
                logger_1.logger.log('Instrument disconnected', `TCP:${this.port}`);
            });
        });
        this.server.listen(this.port, () => {
            logger_1.logger.log(`TCP Listener started on port ${this.port} for instrument ${this.instrumentId}`, 'TCP');
        });
        this.server.on('error', (err) => {
            logger_1.logger.error(`Server error: ${err.message}`, 'TCP');
        });
    }
}
exports.TCPListener = TCPListener;
