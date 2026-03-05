import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { logger } from '../logger';
import { forwarder } from '../forwarder';

export class SerialListener {
    private port: SerialPort | null = null;

    constructor(
        private path: string,
        private baudRate: number,
        private instrumentId: string
    ) { }

    start() {
        try {
            this.port = new SerialPort({
                path: this.path,
                baudRate: this.baudRate,
                autoOpen: false,
            });

            const parser = this.port.pipe(new ReadlineParser({ delimiter: '\r' }));

            this.port.open((err) => {
                if (err) {
                    logger.error(`Failed to open serial port ${this.path}: ${err.message}`, 'Serial');
                    return;
                }
                logger.log(`Serial Listener started on ${this.path} (${this.baudRate} baud) for ${this.instrumentId}`, 'Serial');
            });

            let buffer = '';
            parser.on('data', (data) => {
                // Accumulate data and look for ASTM/HL7 frames if needed.
                // For simplicity, we forward line by line or look for L| termination.
                buffer += data.toString() + '\r';

                // Check for common ASTM termination L|...
                if (buffer.includes('L|')) {
                    logger.log(`Received data from ${this.path} (${buffer.length} bytes)`, 'Serial');
                    forwarder.forward(this.instrumentId, buffer);
                    buffer = '';
                }
            });

            this.port.on('error', (err) => {
                logger.error(`Port error on ${this.path}: ${err.message}`, 'Serial');
            });

        } catch (err: any) {
            logger.error(`Critical serial error: ${err.message}`, 'Serial');
        }
    }
}
