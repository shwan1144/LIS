import * as dotenv from 'dotenv';
import { logger } from './logger';
import { TCPListener } from './listeners/tcp';
import { SerialListener } from './listeners/serial';

dotenv.config();

function bootstrap() {
    logger.log('Starting LIS Gateway Bridge...', 'System');

    // Medonic M51 (TCP)
    const medonicPort = parseInt(process.env.MEDONIC_PORT || '5600', 10);
    const medonicId = process.env.MEDONIC_ID;
    if (medonicId) {
        const medonic = new TCPListener(medonicPort, medonicId);
        medonic.start();
    } else {
        logger.warn('MEDONIC_ID not set, skipping TCP listener.', 'System');
    }

    // Cobas C111 (Serial)
    const c111Port = process.env.COBAS_C111_PORT;
    const c111Baud = parseInt(process.env.COBAS_C111_BAUD || '9600', 10);
    const c111Id = process.env.COBAS_C111_ID;
    if (c111Port && c111Id) {
        const c111 = new SerialListener(c111Port, c111Baud, c111Id);
        c111.start();
    } else {
        logger.warn('COBAS_C111 settings missing, skipping serial listener.', 'System');
    }

    // Cobas E411 (Serial)
    const e411Port = process.env.COBAS_E411_PORT;
    const e411Baud = parseInt(process.env.COBAS_E411_BAUD || '9600', 10);
    const e411Id = process.env.COBAS_E411_ID;
    if (e411Port && e411Id) {
        const e411 = new SerialListener(e411Port, e411Baud, e411Id);
        e411.start();
    } else {
        logger.warn('COBAS_E411 settings missing, skipping serial listener.', 'System');
    }

    logger.log('Gateway engine running. Ready for data.', 'System');
}

bootstrap();
