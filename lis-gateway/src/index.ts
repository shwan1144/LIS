import * as dotenv from 'dotenv';
import { logger } from './logger';
import { TCPListener } from './listeners/tcp';
import { SerialListener } from './listeners/serial';
import { SQLiteStore } from './queue/sqlite-store';
import { Outbox } from './queue/outbox';
import type { OutboxRuntimeConfig } from './queue/types';
import { forwarder } from './forwarder';

dotenv.config();

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = parseInt(value || '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
    const parsed = parseInt(value || '', 10);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return parsed;
}

function loadOutboxConfig(): { dbPath: string; runtime: OutboxRuntimeConfig } {
    const dbPath = process.env.QUEUE_DB_PATH || './data/gateway-queue.db';

    return {
        dbPath,
        runtime: {
            batchSize: parsePositiveInt(process.env.QUEUE_BATCH_SIZE, 50),
            dispatchIntervalMs: parsePositiveInt(process.env.DISPATCH_INTERVAL_MS, 1000),
            cleanupIntervalMs: parsePositiveInt(process.env.CLEANUP_INTERVAL_MS, 60000),
            retentionDays: parsePositiveInt(process.env.QUEUE_RETENTION_DAYS, 7),
            retryBaseMs: parsePositiveInt(process.env.QUEUE_RETRY_BASE_MS, 2000),
            retryMaxMs: parsePositiveInt(process.env.QUEUE_RETRY_MAX_MS, 300000),
            retryJitterFactor: parseNonNegativeInt(process.env.QUEUE_RETRY_JITTER_PERCENT, 20) / 100,
        },
    };
}

function bootstrap() {
    logger.log('Starting LIS Gateway Bridge...', 'System');
    const outboxConfig = loadOutboxConfig();
    let sqliteStore: SQLiteStore;
    let outbox: Outbox;
    try {
        sqliteStore = new SQLiteStore(outboxConfig.dbPath);
        outbox = new Outbox(sqliteStore, forwarder, outboxConfig.runtime);
        outbox.start();
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to initialize SQLite outbox: ${errorMsg}`, 'System');
        process.exit(1);
        return;
    }

    const shutdown = (signal: string) => {
        logger.log(`Received ${signal}, shutting down gateway...`, 'System');
        outbox.stop();
        sqliteStore.close();
        process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Medonic M51 (TCP)
    const medonicPort = parseInt(process.env.MEDONIC_PORT || '5600', 10);
    const medonicId = process.env.MEDONIC_ID;
    if (medonicId) {
        const medonic = new TCPListener(medonicPort, medonicId, outbox);
        medonic.start();
    } else {
        logger.warn('MEDONIC_ID not set, skipping TCP listener.', 'System');
    }

    // Cobas C111 (Serial)
    const c111Port = process.env.COBAS_C111_PORT;
    const c111Baud = parseInt(process.env.COBAS_C111_BAUD || '9600', 10);
    const c111Id = process.env.COBAS_C111_ID;
    if (c111Port && c111Id) {
        const c111 = new SerialListener(c111Port, c111Baud, c111Id, outbox);
        c111.start();
    } else {
        logger.warn('COBAS_C111 settings missing, skipping serial listener.', 'System');
    }

    // Cobas E411 (Serial)
    const e411Port = process.env.COBAS_E411_PORT;
    const e411Baud = parseInt(process.env.COBAS_E411_BAUD || '9600', 10);
    const e411Id = process.env.COBAS_E411_ID;
    if (e411Port && e411Id) {
        const e411 = new SerialListener(e411Port, e411Baud, e411Id, outbox);
        e411.start();
    } else {
        logger.warn('COBAS_E411 settings missing, skipping serial listener.', 'System');
    }

    logger.log('Gateway engine running. Ready for data.', 'System');
}

bootstrap();
