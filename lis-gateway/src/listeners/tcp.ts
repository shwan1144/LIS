import * as net from 'net';
import { logger } from '../logger';
import { forwarder } from '../forwarder';

export class TCPListener {
    private server: net.Server | null = null;

    constructor(private port: number, private instrumentId: string) { }

    start() {
        this.server = net.createServer((socket) => {
            logger.log(`Instrument connected: ${socket.remoteAddress}`, `TCP:${this.port}`);

            let buffer = '';

            socket.on('data', (data) => {
                buffer += data.toString();

                // Simple HL7 MLLP extraction
                const startBlock = '\x0b';
                const endBlock = '\x1c\x0d';

                while (true) {
                    const startIndex = buffer.indexOf(startBlock);
                    if (startIndex === -1) break;

                    const endIndex = buffer.indexOf(endBlock, startIndex);
                    if (endIndex === -1) break;

                    const message = buffer.substring(startIndex + startBlock.length, endIndex);
                    logger.log(`Received HL7 message (${message.length} bytes)`, `TCP:${this.port}`);

                    // Forward to Cloud LIS
                    forwarder.forward(this.instrumentId, message);

                    buffer = buffer.substring(endIndex + endBlock.length);
                }
            });

            socket.on('error', (err) => {
                logger.error(`Socket error: ${err.message}`, `TCP:${this.port}`);
            });

            socket.on('close', () => {
                logger.log('Instrument disconnected', `TCP:${this.port}`);
            });
        });

        this.server.listen(this.port, () => {
            logger.log(`TCP Listener started on port ${this.port} for instrument ${this.instrumentId}`, 'TCP');
        });

        this.server.on('error', (err) => {
            logger.error(`Server error: ${err.message}`, 'TCP');
        });
    }
}
