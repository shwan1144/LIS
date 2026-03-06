import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import type {
    OutboxEnqueueInput,
    OutboxMessageRecord,
    QueueStats,
} from './types';

interface OutboxMessageRow {
    id: string;
    instrument_id: string;
    raw_message: string;
    protocol_hint: string | null;
    status: string;
    attempt_count: number;
    next_retry_at: number;
    last_error: string | null;
    created_at: number;
    updated_at: number;
    delivered_at: number | null;
}

interface QueueStatsRow {
    pending_count: number;
    in_flight_count: number;
    failed_count: number;
    delivered_count: number;
}

interface OldestPendingRow {
    oldest_created_at: number | null;
}

export class SQLiteStore {
    private readonly db: Database.Database;
    private readonly resolvedDbPath: string;

    constructor(dbPath: string) {
        this.resolvedDbPath = path.isAbsolute(dbPath)
            ? dbPath
            : path.resolve(process.cwd(), dbPath);

        const dbDir = path.dirname(this.resolvedDbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        this.db = new Database(this.resolvedDbPath);
        this.configure();
        this.migrate();
    }

    getDbPath(): string {
        return this.resolvedDbPath;
    }

    enqueue(input: OutboxEnqueueInput): OutboxMessageRecord {
        const now = Date.now();
        const message: OutboxMessageRecord = {
            id: randomUUID(),
            instrumentId: input.instrumentId,
            rawMessage: input.rawMessage,
            protocolHint: input.protocolHint ?? null,
            status: 'PENDING',
            attemptCount: 0,
            nextRetryAt: now,
            lastError: null,
            createdAt: now,
            updatedAt: now,
            deliveredAt: null,
        };

        this.db.prepare(`
            INSERT INTO outbox_messages (
                id,
                instrument_id,
                raw_message,
                protocol_hint,
                status,
                attempt_count,
                next_retry_at,
                last_error,
                created_at,
                updated_at,
                delivered_at
            ) VALUES (
                @id,
                @instrument_id,
                @raw_message,
                @protocol_hint,
                @status,
                @attempt_count,
                @next_retry_at,
                @last_error,
                @created_at,
                @updated_at,
                @delivered_at
            )
        `).run({
            id: message.id,
            instrument_id: message.instrumentId,
            raw_message: message.rawMessage,
            protocol_hint: message.protocolHint,
            status: message.status,
            attempt_count: message.attemptCount,
            next_retry_at: message.nextRetryAt,
            last_error: message.lastError,
            created_at: message.createdAt,
            updated_at: message.updatedAt,
            delivered_at: message.deliveredAt,
        });

        return message;
    }

    claimDueMessages(limit: number, nowTs: number): OutboxMessageRecord[] {
        const safeLimit = Math.max(1, limit);

        const claimTx = this.db.transaction((now: number, batchLimit: number) => {
            const rows = this.db.prepare(`
                SELECT
                    id,
                    instrument_id,
                    raw_message,
                    protocol_hint,
                    status,
                    attempt_count,
                    next_retry_at,
                    last_error,
                    created_at,
                    updated_at,
                    delivered_at
                FROM outbox_messages
                WHERE status IN ('PENDING', 'FAILED')
                  AND next_retry_at <= ?
                ORDER BY created_at ASC
                LIMIT ?
            `).all(now, batchLimit) as OutboxMessageRow[];

            if (rows.length === 0) {
                return [] as OutboxMessageRecord[];
            }

            const markInFlightStmt = this.db.prepare(`
                UPDATE outbox_messages
                SET status = 'IN_FLIGHT',
                    updated_at = ?
                WHERE id = ?
            `);

            for (const row of rows) {
                markInFlightStmt.run(now, row.id);
            }

            return rows.map((row) => this.toRecord({
                ...row,
                status: 'IN_FLIGHT',
                updated_at: now,
            }));
        });

        return claimTx(nowTs, safeLimit);
    }

    markDelivered(id: string, deliveredAtTs: number): void {
        this.db.prepare(`
            UPDATE outbox_messages
            SET status = 'DELIVERED',
                delivered_at = ?,
                updated_at = ?,
                last_error = NULL
            WHERE id = ?
        `).run(deliveredAtTs, deliveredAtTs, id);
    }

    markPendingRetry(id: string, nextRetryAtTs: number, lastError: string | null): void {
        const now = Date.now();
        this.db.prepare(`
            UPDATE outbox_messages
            SET status = 'PENDING',
                attempt_count = attempt_count + 1,
                next_retry_at = ?,
                last_error = ?,
                updated_at = ?
            WHERE id = ?
        `).run(nextRetryAtTs, lastError, now, id);
    }

    resetInFlightToPending(nowTs: number): number {
        const result = this.db.prepare(`
            UPDATE outbox_messages
            SET status = 'PENDING',
                next_retry_at = ?,
                updated_at = ?,
                last_error = COALESCE(last_error, 'Recovered after restart')
            WHERE status = 'IN_FLIGHT'
        `).run(nowTs, nowTs);
        return result.changes;
    }

    cleanupDeliveredOlderThan(cutoffTs: number): number {
        const result = this.db.prepare(`
            DELETE FROM outbox_messages
            WHERE status = 'DELIVERED'
              AND delivered_at IS NOT NULL
              AND delivered_at < ?
        `).run(cutoffTs);
        return result.changes;
    }

    getStats(nowTs: number): QueueStats {
        const counts = this.db.prepare(`
            SELECT
                COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending_count,
                COALESCE(SUM(CASE WHEN status = 'IN_FLIGHT' THEN 1 ELSE 0 END), 0) AS in_flight_count,
                COALESCE(SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END), 0) AS failed_count,
                COALESCE(SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END), 0) AS delivered_count
            FROM outbox_messages
        `).get() as QueueStatsRow;

        const oldestPending = this.db.prepare(`
            SELECT MIN(created_at) AS oldest_created_at
            FROM outbox_messages
            WHERE status IN ('PENDING', 'FAILED')
        `).get() as OldestPendingRow;

        const oldestPendingAgeMs = oldestPending.oldest_created_at == null
            ? null
            : Math.max(0, nowTs - oldestPending.oldest_created_at);

        return {
            pendingCount: counts.pending_count,
            inFlightCount: counts.in_flight_count,
            failedCount: counts.failed_count,
            deliveredCount: counts.delivered_count,
            queueDepth: counts.pending_count + counts.in_flight_count + counts.failed_count,
            oldestPendingAgeMs,
        };
    }

    close(): void {
        this.db.close();
    }

    private configure(): void {
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('busy_timeout = 5000');
    }

    private migrate(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS outbox_messages (
                id TEXT PRIMARY KEY,
                instrument_id TEXT NOT NULL,
                raw_message TEXT NOT NULL,
                protocol_hint TEXT NULL,
                status TEXT NOT NULL CHECK (status IN ('PENDING', 'IN_FLIGHT', 'DELIVERED', 'FAILED')),
                attempt_count INTEGER NOT NULL DEFAULT 0,
                next_retry_at INTEGER NOT NULL,
                last_error TEXT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                delivered_at INTEGER NULL
            );

            CREATE INDEX IF NOT EXISTS idx_outbox_status_retry
                ON outbox_messages (status, next_retry_at);

            CREATE INDEX IF NOT EXISTS idx_outbox_created_at
                ON outbox_messages (created_at);
        `);
    }

    private toRecord(row: OutboxMessageRow): OutboxMessageRecord {
        return {
            id: row.id,
            instrumentId: row.instrument_id,
            rawMessage: row.raw_message,
            protocolHint: row.protocol_hint,
            status: row.status as OutboxMessageRecord['status'],
            attemptCount: row.attempt_count,
            nextRetryAt: row.next_retry_at,
            lastError: row.last_error,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            deliveredAt: row.delivered_at,
        };
    }
}
