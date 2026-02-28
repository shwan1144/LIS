-- Concurrency-safe counters + uniqueness guarantees for order numbering/barcodes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "lab_counters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "labId" uuid NOT NULL,
  "counterType" varchar(64) NOT NULL,
  "scopeKey" varchar(128) NOT NULL DEFAULT '__default__',
  "dateKey" date NOT NULL,
  "shiftId" uuid NULL,
  "shiftScopeKey" varchar(36) NOT NULL DEFAULT '',
  "value" bigint NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'FK_lab_counters_labId_labs'
  ) THEN
    ALTER TABLE "lab_counters"
      ADD CONSTRAINT "FK_lab_counters_labId_labs"
      FOREIGN KEY ("labId") REFERENCES "labs"("id")
      ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.shifts') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'FK_lab_counters_shiftId_shifts'
     ) THEN
    ALTER TABLE "lab_counters"
      ADD CONSTRAINT "FK_lab_counters_shiftId_shifts"
      FOREIGN KEY ("shiftId") REFERENCES "shifts"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- Normalize legacy rows before enforcing strict shift scope check.
UPDATE "lab_counters"
SET "shiftScopeKey" = ''
WHERE "shiftScopeKey" IS NULL;

UPDATE "lab_counters"
SET "shiftScopeKey" = CASE
  WHEN "shiftId" IS NULL THEN ''
  ELSE "shiftId"::text
END
WHERE "shiftScopeKey" IS DISTINCT FROM CASE
  WHEN "shiftId" IS NULL THEN ''
  ELSE "shiftId"::text
END;

-- Deduplicate any legacy collisions before adding unique index.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY
        "labId",
        "counterType",
        "scopeKey",
        "dateKey",
        "shiftScopeKey"
      ORDER BY
        "value" DESC,
        "updatedAt" DESC,
        "createdAt" DESC,
        "id" ASC
    ) AS rn
  FROM "lab_counters"
)
DELETE FROM "lab_counters" c
USING ranked r
WHERE c."id" = r."id"
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CHK_lab_counters_shift_scope_key'
  ) THEN
    ALTER TABLE "lab_counters"
      ADD CONSTRAINT "CHK_lab_counters_shift_scope_key"
      CHECK (
        ("shiftId" IS NULL AND "shiftScopeKey" = '')
        OR ("shiftId" IS NOT NULL AND "shiftScopeKey" = "shiftId"::text)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_lab_counters_scope"
  ON "lab_counters" ("labId", "counterType", "scopeKey", "dateKey", "shiftScopeKey");

CREATE INDEX IF NOT EXISTS "IDX_lab_counters_lab_date"
  ON "lab_counters" ("labId", "dateKey");

DO $$
BEGIN
  -- Normalize legacy duplicate order numbers inside the same lab.
  WITH ranked AS (
    SELECT
      "id",
      "orderNumber",
      ROW_NUMBER() OVER (
        PARTITION BY "labId", "orderNumber"
        ORDER BY "createdAt" ASC, "id" ASC
      ) AS rn
    FROM "orders"
    WHERE "orderNumber" IS NOT NULL
  )
  UPDATE "orders" o
  SET "orderNumber" = LEFT(r."orderNumber", 52) || '-D' || SUBSTRING(REPLACE(o."id"::text, '-', '') FROM 1 FOR 10),
      "updatedAt" = CURRENT_TIMESTAMP
  FROM ranked r
  WHERE o."id" = r."id"
    AND r.rn > 1;

  -- Safety check after normalization.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT "labId", "orderNumber", COUNT(*) AS cnt
      FROM "orders"
      WHERE "orderNumber" IS NOT NULL
      GROUP BY "labId", "orderNumber"
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'Duplicate orderNumber values still exist after normalization.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_orders_lab_order_number"
  ON "orders" ("labId", "orderNumber")
  WHERE "orderNumber" IS NOT NULL;

DO $$
BEGIN
  -- Normalize legacy duplicate barcodes inside the same lab.
  WITH ranked AS (
    SELECT
      "id",
      "barcode",
      ROW_NUMBER() OVER (
        PARTITION BY "labId", "barcode"
        ORDER BY "createdAt" ASC, "id" ASC
      ) AS rn
    FROM "samples"
    WHERE "barcode" IS NOT NULL
  )
  UPDATE "samples" s
  SET "barcode" = LEFT(r."barcode", 116) || '-D' || SUBSTRING(REPLACE(s."id"::text, '-', '') FROM 1 FOR 10),
      "updatedAt" = CURRENT_TIMESTAMP
  FROM ranked r
  WHERE s."id" = r."id"
    AND r.rn > 1;

  -- Safety check after normalization.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT "labId", "barcode", COUNT(*) AS cnt
      FROM "samples"
      WHERE "barcode" IS NOT NULL
      GROUP BY "labId", "barcode"
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'Duplicate sample barcode values still exist after normalization.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_samples_lab_barcode"
  ON "samples" ("labId", "barcode")
  WHERE "barcode" IS NOT NULL;
