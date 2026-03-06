"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SerialListener = void 0;
const serialport_1 = require("serialport");
const parser_readline_1 = require("@serialport/parser-readline");
const logger_1 = require("../logger");
class SerialListener {
    path;
    baudRate;
    instrumentId;
    outbox;
    port = null;
    constructor(path, baudRate, instrumentId, outbox) {
        this.path = path;
        this.baudRate = baudRate;
        this.instrumentId = instrumentId;
        this.outbox = outbox;
    }
    start() {
        try {
            this.port = new serialport_1.SerialPort({
                path: this.path,
                baudRate: this.baudRate,
                autoOpen: false,
            });
            const parser = this.port.pipe(new parser_readline_1.ReadlineParser({ delimiter: '\r' }));
            this.port.open((err) => {
                if (err) {
                    logger_1.logger.error(`Failed to open serial port ${this.path}: ${err.message}`, 'Serial');
                    return;
                }
                logger_1.logger.log(`Serial Listener started on ${this.path} (${this.baudRate} baud) for ${this.instrumentId}`, 'Serial');
            });
            let buffer = '';
            parser.on('data', (data) => {
                // Accumulate data and look for ASTM/HL7 frames if needed.
                // For simplicity, we forward line by line or look for L| termination.
                buffer += data.toString() + '\r';
                // Check for common ASTM termination L|...
                if (buffer.includes('L|')) {
                    logger_1.logger.log(`Received data from ${this.path} (${buffer.length} bytes)`, 'Serial');
                    try {
                        this.outbox.enqueue({
                            instrumentId: this.instrumentId,
                            rawMessage: buffer,
                            protocolHint: 'ASTM',
                        });
                    }
                    catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        logger_1.logger.error(`Failed to enqueue serial message for ${this.instrumentId}: ${errorMsg}`, 'Serial');
                    }
                    buffer = '';
                }
            });
            this.port.on('error', (err) => {
                logger_1.logger.error(`Port error on ${this.path}: ${err.message}`, 'Serial');
            });
        }
        catch (err) {
            logger_1.logger.error(`Critical serial error: ${err.message}`, 'Serial');
        }
    }
}
exports.SerialListener = SerialListener;
