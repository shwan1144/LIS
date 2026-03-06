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
const dotenv = __importStar(require("dotenv"));
const logger_1 = require("./logger");
const tcp_1 = require("./listeners/tcp");
const serial_1 = require("./listeners/serial");
const sqlite_store_1 = require("./queue/sqlite-store");
const outbox_1 = require("./queue/outbox");
const forwarder_1 = require("./forwarder");
dotenv.config();
function parsePositiveInt(value, fallback) {
    const parsed = parseInt(value || '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return fallback;
    return parsed;
}
function parseNonNegativeInt(value, fallback) {
    const parsed = parseInt(value || '', 10);
    if (!Number.isFinite(parsed) || parsed < 0)
        return fallback;
    return parsed;
}
function loadOutboxConfig() {
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
    logger_1.logger.log('Starting LIS Gateway Bridge...', 'System');
    const outboxConfig = loadOutboxConfig();
    let sqliteStore;
    let outbox;
    try {
        sqliteStore = new sqlite_store_1.SQLiteStore(outboxConfig.dbPath);
        outbox = new outbox_1.Outbox(sqliteStore, forwarder_1.forwarder, outboxConfig.runtime);
        outbox.start();
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger_1.logger.error(`Failed to initialize SQLite outbox: ${errorMsg}`, 'System');
        process.exit(1);
        return;
    }
    const shutdown = (signal) => {
        logger_1.logger.log(`Received ${signal}, shutting down gateway...`, 'System');
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
        const medonic = new tcp_1.TCPListener(medonicPort, medonicId, outbox);
        medonic.start();
    }
    else {
        logger_1.logger.warn('MEDONIC_ID not set, skipping TCP listener.', 'System');
    }
    // Cobas C111 (Serial)
    const c111Port = process.env.COBAS_C111_PORT;
    const c111Baud = parseInt(process.env.COBAS_C111_BAUD || '9600', 10);
    const c111Id = process.env.COBAS_C111_ID;
    if (c111Port && c111Id) {
        const c111 = new serial_1.SerialListener(c111Port, c111Baud, c111Id, outbox);
        c111.start();
    }
    else {
        logger_1.logger.warn('COBAS_C111 settings missing, skipping serial listener.', 'System');
    }
    // Cobas E411 (Serial)
    const e411Port = process.env.COBAS_E411_PORT;
    const e411Baud = parseInt(process.env.COBAS_E411_BAUD || '9600', 10);
    const e411Id = process.env.COBAS_E411_ID;
    if (e411Port && e411Id) {
        const e411 = new serial_1.SerialListener(e411Port, e411Baud, e411Id, outbox);
        e411.start();
    }
    else {
        logger_1.logger.warn('COBAS_E411 settings missing, skipping serial listener.', 'System');
    }
    logger_1.logger.log('Gateway engine running. Ready for data.', 'System');
}
bootstrap();
