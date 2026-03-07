"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Outbox = void 0;
const logger_1 = require("../logger");
const retry_policy_1 = require("./retry-policy");
function trimError(message, maxLength = 1500) {
    if (message.length <= maxLength) {
        return message;
    }
    return `${message.slice(0, maxLength - 3)}...`;
}
function describeAge(ageMs) {
    if (ageMs == null)
        return 'n/a';
    if (ageMs < 1000)
        return `${ageMs}ms`;
    const totalSeconds = Math.floor(ageMs / 1000);
    if (totalSeconds < 60)
        return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60)
        return `${minutes}m ${seconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
}
class Outbox {
    store;
    forwarder;
    config;
    dispatchTimer = null;
    maintenanceTimer = null;
    dispatchInProgress = false;
    started = false;
    constructor(store, forwarder, config) {
        this.store = store;
        this.forwarder = forwarder;
        this.config = config;
    }
    start() {
        if (this.started)
            return;
        this.started = true;
        const recovered = this.store.resetInFlightToPending(Date.now());
        if (recovered > 0) {
            logger_1.logger.warn(`Recovered ${recovered} in-flight message(s) back to pending state on startup`, 'Outbox');
        }
        this.dispatchTimer = setInterval(() => {
            void this.dispatchOnce();
        }, this.config.dispatchIntervalMs);
        this.maintenanceTimer = setInterval(() => {
            this.runMaintenance();
        }, this.config.cleanupIntervalMs);
        logger_1.logger.log(`Outbox started (db=${this.store.getDbPath()}, batch=${this.config.batchSize}, tick=${this.config.dispatchIntervalMs}ms)`, 'Outbox');
        void this.dispatchOnce();
        this.runMaintenance();
    }
    stop() {
        this.started = false;
        if (this.dispatchTimer) {
            clearInterval(this.dispatchTimer);
            this.dispatchTimer = null;
        }
        if (this.maintenanceTimer) {
            clearInterval(this.maintenanceTimer);
            this.maintenanceTimer = null;
        }
    }
    enqueue(input) {
        this.enforceStorageLimitBeforeEnqueue();
        const record = this.store.enqueue(input);
        logger_1.logger.log(`Accepted message ${record.id} from instrument ${record.instrumentId} into local queue`, 'Outbox');
        return record.id;
    }
    getStats() {
        return this.store.getStats(Date.now());
    }
    async dispatchOnce() {
        if (!this.started || this.dispatchInProgress) {
            return;
        }
        this.dispatchInProgress = true;
        try {
            const batch = this.store.claimDueMessages(this.config.batchSize, Date.now());
            if (batch.length === 0) {
                return;
            }
            for (const message of batch) {
                await this.deliverOne(message);
            }
        }
        catch (error) {
            logger_1.logger.error(`Dispatch loop failed: ${this.getErrorMessage(error)}`, 'Outbox');
        }
        finally {
            this.dispatchInProgress = false;
        }
    }
    async deliverOne(message) {
        try {
            const result = await this.forwarder.deliver(message);
            this.store.markDelivered(message.id, Date.now());
            const suffix = result.messageId ? ` (LIS message ID: ${result.messageId})` : '';
            logger_1.logger.log(`Delivered message ${message.id}${suffix}`, 'Outbox');
            if (result.warning) {
                logger_1.logger.warn(`Delivery warning for ${message.id}: ${result.warning}`, 'Outbox');
            }
        }
        catch (error) {
            const attemptNumber = message.attemptCount + 1;
            const retryDelayMs = (0, retry_policy_1.computeRetryDelayMs)(attemptNumber, this.config.retryBaseMs, this.config.retryMaxMs, this.config.retryJitterFactor);
            const nextRetryAt = Date.now() + retryDelayMs;
            const errorMessage = trimError(this.getErrorMessage(error));
            this.store.markPendingRetry(message.id, nextRetryAt, errorMessage);
            logger_1.logger.warn(`Delivery failed for ${message.id} (attempt ${attemptNumber}). Retry in ${retryDelayMs}ms. Error: ${errorMessage}`, 'Outbox');
        }
    }
    runMaintenance() {
        try {
            const now = Date.now();
            const retentionWindowMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
            const deleted = this.store.cleanupDeliveredOlderThan(now - retentionWindowMs);
            if (deleted > 0) {
                logger_1.logger.log(`Cleaned up ${deleted} delivered message(s) older than ${this.config.retentionDays} day(s)`, 'Outbox');
            }
            const stats = this.store.getStats(now);
            logger_1.logger.log(`Queue stats: depth=${stats.queueDepth}, pending=${stats.pendingCount}, inFlight=${stats.inFlightCount}, failed=${stats.failedCount}, delivered=${stats.deliveredCount}, oldestPending=${describeAge(stats.oldestPendingAgeMs)}`, 'Outbox');
        }
        catch (error) {
            logger_1.logger.error(`Maintenance failed: ${this.getErrorMessage(error)}`, 'Outbox');
        }
    }
    enforceStorageLimitBeforeEnqueue() {
        const maxDbBytes = this.config.maxDbBytes;
        if (!maxDbBytes || maxDbBytes <= 0) {
            return;
        }
        const sizeBefore = this.store.getDatabaseSizeBytes();
        if (sizeBefore <= maxDbBytes) {
            return;
        }
        const deleted = this.store.cleanupDeliveredOlderThan(Date.now() + 1);
        if (deleted > 0) {
            logger_1.logger.warn(`Queue storage exceeded ${maxDbBytes} bytes; removed ${deleted} delivered message(s) to reclaim space`, 'Outbox');
        }
        const sizeAfter = this.store.getDatabaseSizeBytes();
        if (sizeAfter > maxDbBytes) {
            throw new Error(`Queue DB size ${sizeAfter} bytes exceeded configured limit ${maxDbBytes} bytes after cleanup`);
        }
    }
    getErrorMessage(error) {
        if (error instanceof Error)
            return error.message;
        return String(error);
    }
}
exports.Outbox = Outbox;
