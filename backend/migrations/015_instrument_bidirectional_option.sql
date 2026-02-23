-- Add optional per-instrument bidirectional mode switch.
-- Default is OFF for safety.

ALTER TABLE "instruments"
  ADD COLUMN IF NOT EXISTS "bidirectionalEnabled" boolean NOT NULL DEFAULT false;

UPDATE "instruments"
SET "bidirectionalEnabled" = false
WHERE "bidirectionalEnabled" IS NULL;
