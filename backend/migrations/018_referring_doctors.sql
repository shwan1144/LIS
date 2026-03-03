-- Per-lab referring doctors list used by order entry and reporting flows.
ALTER TABLE labs
  ADD COLUMN IF NOT EXISTS "referringDoctors" jsonb NOT NULL DEFAULT '[]'::jsonb;
