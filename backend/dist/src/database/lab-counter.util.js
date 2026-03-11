"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextLabCounterValue = nextLabCounterValue;
exports.nextLabCounterValueWithFloor = nextLabCounterValueWithFloor;
exports.peekNextLabCounterValue = peekNextLabCounterValue;
function toLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function normalizeDateKey(value) {
    if (!value)
        return null;
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        throw new Error(`Invalid counter dateKey "${value}". Expected YYYY-MM-DD.`);
    }
    const probe = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== trimmed) {
        throw new Error(`Invalid counter dateKey "${value}". Expected YYYY-MM-DD.`);
    }
    return trimmed;
}
function normalizeFloorValue(value) {
    if (!Number.isFinite(value) || value < 0) {
        return 0;
    }
    return Math.floor(value);
}
function normalizeIncrementValue(value) {
    if (!Number.isFinite(value)) {
        throw new Error('Lab counter increment must be a finite number');
    }
    const normalized = Math.floor(value);
    if (normalized <= 0) {
        throw new Error('Lab counter increment must be greater than zero');
    }
    return normalized;
}
async function nextLabCounterValue(manager, input) {
    return nextLabCounterValueWithFloor(manager, input, 0);
}
async function nextLabCounterValueWithFloor(manager, input, floorValue, increment = 1) {
    const date = input.date ?? new Date();
    const dateKey = normalizeDateKey(input.dateKey) ?? toLocalDateKey(date);
    const scopeKey = (input.scopeKey ?? '').trim() || '__default__';
    const shiftId = input.shiftId ?? null;
    const shiftScopeKey = shiftId ?? '';
    const floor = normalizeFloorValue(floorValue);
    const normalizedIncrement = normalizeIncrementValue(increment);
    const rows = await manager.query(`
      INSERT INTO "lab_counters" (
        "labId",
        "counterType",
        "scopeKey",
        "dateKey",
        "shiftId",
        "shiftScopeKey",
        "value"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::bigint + $8::bigint)
      ON CONFLICT ("labId", "counterType", "scopeKey", "dateKey", "shiftScopeKey")
      DO UPDATE
        SET "value" = GREATEST("lab_counters"."value", $7::bigint) + $8::bigint,
            "shiftId" = EXCLUDED."shiftId",
            "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "value"
    `, [input.labId, input.counterType, scopeKey, dateKey, shiftId, shiftScopeKey, floor, normalizedIncrement]);
    const value = Number(rows?.[0]?.value);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Failed to increment lab counter ${input.counterType} for lab ${input.labId}`);
    }
    return Math.floor(value) - normalizedIncrement + 1;
}
async function peekNextLabCounterValue(manager, input) {
    const date = input.date ?? new Date();
    const dateKey = normalizeDateKey(input.dateKey) ?? toLocalDateKey(date);
    const scopeKey = (input.scopeKey ?? '').trim() || '__default__';
    const shiftScopeKey = input.shiftId ?? '';
    const rows = await manager.query(`
      SELECT "value"
      FROM "lab_counters"
      WHERE "labId" = $1
        AND "counterType" = $2
        AND "scopeKey" = $3
        AND "dateKey" = $4
        AND "shiftScopeKey" = $5
      LIMIT 1
    `, [input.labId, input.counterType, scopeKey, dateKey, shiftScopeKey]);
    const current = Number(rows?.[0]?.value ?? 0);
    if (!Number.isFinite(current) || current < 0) {
        return 1;
    }
    return Math.floor(current) + 1;
}
//# sourceMappingURL=lab-counter.util.js.map