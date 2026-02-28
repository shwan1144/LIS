-- Qualitative result entry support for tests (predefined text options + optional custom text)
-- Also extends result flag enums with POS / NEG / ABN values.

ALTER TABLE "tests"
  ADD COLUMN IF NOT EXISTS "resultEntryType" varchar(16) NOT NULL DEFAULT 'NUMERIC';

ALTER TABLE "tests"
  ADD COLUMN IF NOT EXISTS "resultTextOptions" jsonb;

ALTER TABLE "tests"
  ADD COLUMN IF NOT EXISTS "allowCustomResultText" boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  enum_name text;
BEGIN
  FOREACH enum_name IN ARRAY ARRAY[
    'order_tests_flag_enum',
    'order_test_result_history_flag_enum',
    'unmatched_instrument_results_flag_enum'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = enum_name) THEN
      EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS ''POS''', enum_name);
      EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS ''NEG''', enum_name);
      EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS ''ABN''', enum_name);
    END IF;
  END LOOP;
END $$;

