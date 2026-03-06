import { logger } from '../logger';
import { Forwarder } from '../forwarder';
import { computeRetryDelayMs } from './retry-policy';
import { SQLiteStore } from './sqlite-store';
import type {
    OutboxEnqueueInput,
    OutboxMessageRecord,
    OutboxRuntimeConfig,
} from './types';

function trimError(message: string, maxLength = 1500): string {
    if (message.length <= maxLength) {
        return message;
    }
    return `${message.slice(0, maxLength - 3)}...`;
}

function describeAge(ageMs: number | null): string {
    if (ageMs == null) return 'n/a';
    if (ageMs < 1000) return `${ageMs}ms`;
    const totalSeconds = Math.floor(ageMs / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60) return `${minutes}m ${seconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
}

export class Outbox {
    private dispatchTimer: NodeJS.Timeout | null = null;
    private maintenanceTimer: NodeJS.Timeout | null = null;
    private dispatchInProgress = false;
    private started = false;

    constructor(
        private readonly store: SQLiteStore,
        private readonly forwarder: Forwarder,
        private readonly config: OutboxRuntimeConfig,
    ) { }

    start(): void {
        if (this.started) return;
        this.started = true;

        const recovered = this.store.resetInFlightToPending(Date.now());
        if (recovered > 0) {
            logger.warn(
                `Recovered ${recovered} in-flight message(s) back to pending state on startup`,
                'Outbox',
            );
        }

        this.dispatchTimer = setInterval(() => {
            void this.dispatchOnce();
        }, this.config.dispatchIntervalMs);

        this.maintenanceTimer = setInterval(() => {
            this.runMaintenance();
        }, this.config.cleanupIntervalMs);

        logger.log(
            `Outbox started (db=${this.store.getDbPath()}, batch=${this.config.batchSize}, tick=${this.config.dispatchIntervalMs}ms)`,
            'Outbox',
        );

        void this.dispatchOnce();
        this.runMaintenance();
    }

    stop(): void {
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

    enqueue(input: OutboxEnqueueInput): string {
        const record = this.store.enqueue(input);
        logger.log(
            `Accepted message ${record.id} from instrument ${record.instrumentId} into local queue`,
            'Outbox',
        );
        return record.id;
    }

    private async dispatchOnce(): Promise<void> {
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
        } catch (error) {
            logger.error(`Dispatch loop failed: ${this.getErrorMessage(error)}`, 'Outbox');
        } finally {
            this.dispatchInProgress = false;
        }
    }

    private async deliverOne(message: OutboxMessageRecord): Promise<void> {
        try {
            const result = await this.forwarder.deliver(message);
            this.store.markDelivered(message.id, Date.now());
            const suffix = result.messageId ? ` (LIS message ID: ${result.messageId})` : '';
            logger.log(`Delivered message ${message.id}${suffix}`, 'Outbox');
            if (result.warning) {
                logger.warn(`Delivery warning for ${message.id}: ${result.warning}`, 'Outbox');
            }
        } catch (error) {
            const attemptNumber = message.attemptCount + 1;
            const retryDelayMs = computeRetryDelayMs(
                attemptNumber,
                this.config.retryBaseMs,
                this.config.retryMaxMs,
                this.config.retryJitterFactor,
            );
            const nextRetryAt = Date.now() + retryDelayMs;
            const errorMessage = trimError(this.getErrorMessage(error));

            this.store.markPendingRetry(message.id, nextRetryAt, errorMessage);
            logger.warn(
                `Delivery failed for ${message.id} (attempt ${attemptNumber}). Retry in ${retryDelayMs}ms. Error: ${errorMessage}`,
                'Outbox',
            );
        }
    }

    private runMaintenance(): void {
        try {
            const now = Date.now();
            const retentionWindowMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
            const deleted = this.store.cleanupDeliveredOlderThan(now - retentionWindowMs);
            if (deleted > 0) {
                logger.log(`Cleaned up ${deleted} delivered message(s) older than ${this.config.retentionDays} day(s)`, 'Outbox');
            }

            const stats = this.store.getStats(now);
            logger.log(
                `Queue stats: depth=${stats.queueDepth}, pending=${stats.pendingCount}, inFlight=${stats.inFlightCount}, failed=${stats.failedCount}, delivered=${stats.deliveredCount}, oldestPending=${describeAge(stats.oldestPendingAgeMs)}`,
                'Outbox',
            );
        } catch (error) {
            logger.error(`Maintenance failed: ${this.getErrorMessage(error)}`, 'Outbox');
        }
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) return error.message;
        return String(error);
    }
}
