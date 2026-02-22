import { EntityManager } from 'typeorm';

export interface LabCounterNextValueInput {
  labId: string;
  counterType: string;
  scopeKey?: string | null;
  date?: Date;
  shiftId?: string | null;
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function nextLabCounterValue(
  manager: EntityManager,
  input: LabCounterNextValueInput,
): Promise<number> {
  const date = input.date ?? new Date();
  const dateKey = toLocalDateKey(date);
  const scopeKey = (input.scopeKey ?? '').trim() || '__default__';
  const shiftId = input.shiftId ?? null;
  const shiftScopeKey = shiftId ?? '';

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
      VALUES ($1, $2, $3, $4, $5, $6, 1)
      ON CONFLICT ("labId", "counterType", "scopeKey", "dateKey", "shiftScopeKey")
      DO UPDATE
        SET "value" = "lab_counters"."value" + 1,
            "shiftId" = EXCLUDED."shiftId",
            "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "value"
    `,
    [input.labId, input.counterType, scopeKey, dateKey, shiftId, shiftScopeKey],
  ) as Array<{ value: string | number }>;

  const value = Number(rows?.[0]?.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Failed to increment lab counter ${input.counterType} for lab ${input.labId}`);
  }

  return Math.floor(value);
}

export async function peekNextLabCounterValue(
  manager: EntityManager,
  input: LabCounterNextValueInput,
): Promise<number> {
  const date = input.date ?? new Date();
  const dateKey = toLocalDateKey(date);
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
