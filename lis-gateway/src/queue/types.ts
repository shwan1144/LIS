export type OutboxStatus = 'PENDING' | 'IN_FLIGHT' | 'DELIVERED' | 'FAILED';

export interface OutboxEnqueueInput {
    instrumentId: string;
    rawMessage: string;
    protocolHint?: string | null;
}

export interface OutboxMessageRecord {
    id: string;
    instrumentId: string;
    rawMessage: string;
    protocolHint: string | null;
    status: OutboxStatus;
    attemptCount: number;
    nextRetryAt: number;
    lastError: string | null;
    createdAt: number;
    updatedAt: number;
    deliveredAt: number | null;
}

export interface QueueStats {
    pendingCount: number;
    inFlightCount: number;
    failedCount: number;
    deliveredCount: number;
    queueDepth: number;
    oldestPendingAgeMs: number | null;
}

export interface OutboxRuntimeConfig {
    batchSize: number;
    dispatchIntervalMs: number;
    cleanupIntervalMs: number;
    retentionDays: number;
    retryBaseMs: number;
    retryMaxMs: number;
    retryJitterFactor: number;
}
