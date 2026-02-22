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
    RAISE EXCEPTION 'Duplicate orderNumber values found per lab. Resolve duplicates before applying 013_atomic_counters_and_uniques.sql';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_orders_lab_order_number"
  ON "orders" ("labId", "orderNumber")
  WHERE "orderNumber" IS NOT NULL;

DO $$
BEGIN
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
    RAISE EXCEPTION 'Duplicate sample barcode values found per lab. Resolve duplicates before applying 013_atomic_counters_and_uniques.sql';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_samples_lab_barcode"
  ON "samples" ("labId", "barcode")
  WHERE "barcode" IS NOT NULL;
