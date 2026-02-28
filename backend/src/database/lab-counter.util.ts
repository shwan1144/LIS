import { EntityManager } from 'typeorm';

export interface LabCounterNextValueInput {
  labId: string;
  counterType: string;
  scopeKey?: string | null;
  date?: Date;
  dateKey?: string;
  shiftId?: string | null;
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
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

function normalizeFloorValue(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function normalizeIncrementValue(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Lab counter increment must be a finite number');
  }
  const normalized = Math.floor(value);
  if (normalized <= 0) {
    throw new Error('Lab counter increment must be greater than zero');
  }
  return normalized;
}

export async function nextLabCounterValue(
  manager: EntityManager,
  input: LabCounterNextValueInput,
): Promise<number> {
  return nextLabCounterValueWithFloor(manager, input, 0);
}

export async function nextLabCounterValueWithFloor(
  manager: EntityManager,
  input: LabCounterNextValueInput,
  floorValue: number,
  increment: number = 1,
): Promise<number> {
  const date = input.date ?? new Date();
  const dateKey = normalizeDateKey(input.dateKey) ?? toLocalDateKey(date);
  const scopeKey = (input.scopeKey ?? '').trim() || '__default__';
  const shiftId = input.shiftId ?? null;
  const shiftScopeKey = shiftId ?? '';
  const floor = normalizeFloorValue(floorValue);
  const normalizedIncrement = normalizeIncrementValue(increment);

  const rows = await manager.query(
    `
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
    `,
    [input.labId, input.counterType, scopeKey, dateKey, shiftId, shiftScopeKey, floor, normalizedIncrement],
  ) as Array<{ value: string | number }>;

  const value = Number(rows?.[0]?.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Failed to increment lab counter ${input.counterType} for lab ${input.labId}`);
  }

  return Math.floor(value) - normalizedIncrement + 1;
}

export async function peekNextLabCounterValue(
  manager: EntityManager,
  input: LabCounterNextValueInput,
): Promise<number> {
  const date = input.date ?? new Date();
  const dateKey = normalizeDateKey(input.dateKey) ?? toLocalDateKey(date);
  const scopeKey = (input.scopeKey ?? '').trim() || '__default__';
  const shiftScopeKey = input.shiftId ?? '';

  const rows = await manager.query(
    `
      SELECT "value"
      FROM "lab_counters"
      WHERE "labId" = $1
        AND "counterType" = $2
        AND "scopeKey" = $3
        AND "dateKey" = $4
        AND "shiftScopeKey" = $5
      LIMIT 1
    `,
    [input.labId, input.counterType, scopeKey, dateKey, shiftScopeKey],
  ) as Array<{ value: string | number }>;

  const current = Number(rows?.[0]?.value ?? 0);
  if (!Number.isFinite(current) || current < 0) {
    return 1;
  }
  return Math.floor(current) + 1;
}
