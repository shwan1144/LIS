-- Compatibility guard:
-- Some environments already have tests.abbreviation created manually.
-- In that case, mark 016_test_abbreviation.sql as applied so runner can continue.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tests'
      AND column_name = 'abbreviation'
  ) THEN
    INSERT INTO "schema_migrations" ("filename", "checksum")
    VALUES (
      '016_test_abbreviation.sql',
      'b5a3829cc14a9f4ae917de16d749f40b4169e5b25f93a94e60c3c6694263fddd'
    )
    ON CONFLICT ("filename") DO NOTHING;
  END IF;
END $$;
