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
function normalizeFloorValue(value) {
    if (!Number.isFinite(value) || value < 0) {
        return 0;
    }
    return Math.floor(value);
}
async function nextLabCounterValue(manager, input) {
    return nextLabCounterValueWithFloor(manager, input, 0);
}
async function nextLabCounterValueWithFloor(manager, input, floorValue) {
    const date = input.date ?? new Date();
    const dateKey = toLocalDateKey(date);
    const scopeKey = (input.scopeKey ?? '').trim() || '__default__';
    const shiftId = input.shiftId ?? null;
    const shiftScopeKey = shiftId ?? '';
    const floor = normalizeFloorValue(floorValue);
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
      VALUES ($1, $2, $3, $4, $5, $6, $7 + 1)
      ON CONFLICT ("labId", "counterType", "scopeKey", "dateKey", "shiftScopeKey")
      DO UPDATE
        SET "value" = GREATEST("lab_counters"."value", $7) + 1,
            "shiftId" = EXCLUDED."shiftId",
            "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "value"
    `, [input.labId, input.counterType, scopeKey, dateKey, shiftId, shiftScopeKey, floor]);
    const value = Number(rows?.[0]?.value);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Failed to increment lab counter ${input.counterType} for lab ${input.labId}`);
    }
    return Math.floor(value);
}
async function peekNextLabCounterValue(manager, input) {
    const date = input.date ?? new Date();
    const dateKey = toLocalDateKey(date);
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