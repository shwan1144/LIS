-- Allow longer enum-like text values (e.g. CULTURE_SENSITIVITY) in tests.resultEntryType.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tests'
      AND column_name = 'resultEntryType'
  ) THEN
    ALTER TABLE "tests"
      ALTER COLUMN "resultEntryType" TYPE varchar(32);
  END IF;
END $$;
