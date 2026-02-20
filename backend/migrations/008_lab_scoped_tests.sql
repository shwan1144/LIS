-- Make tests lab-scoped so every lab has isolated test catalog/management.
-- Safe to run once on existing deployments with global tests.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Schema changes
-- -----------------------------------------------------------------------------
ALTER TABLE "tests"
  ADD COLUMN IF NOT EXISTS "labId" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_tests_labId_labs'
  ) THEN
    ALTER TABLE "tests"
      ADD CONSTRAINT "FK_tests_labId_labs"
      FOREIGN KEY ("labId") REFERENCES "labs"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

-- Normalize codes to reduce duplicate risk during scoped uniqueness.
UPDATE "tests"
SET "code" = UPPER(BTRIM("code"))
WHERE "code" IS NOT NULL
  AND "code" <> UPPER(BTRIM("code"));

-- Drop legacy global uniqueness on tests.code before cloning scoped rows.
DO $$
DECLARE
  row_record record;
BEGIN
  FOR row_record IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'tests'
      AND con.contype = 'u'
      AND EXISTS (
        SELECT 1
        FROM unnest(con.conkey) k(attnum)
        JOIN pg_attribute att
          ON att.attrelid = con.conrelid
         AND att.attnum = k.attnum
        WHERE att.attname = 'code'
      )
  LOOP
    IF row_record.conname <> 'UQ_tests_lab_code' THEN
      EXECUTE format('ALTER TABLE "tests" DROP CONSTRAINT IF EXISTS %I', row_record.conname);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  row_record record;
BEGIN
  FOR row_record IN
    SELECT i.relname AS index_name
    FROM pg_index idx
    JOIN pg_class t ON t.oid = idx.indrelid
    JOIN pg_class i ON i.oid = idx.indexrelid
    WHERE t.relname = 'tests'
      AND idx.indisunique
      AND EXISTS (
        SELECT 1
        FROM unnest(idx.indkey) k(attnum)
        JOIN pg_attribute att
          ON att.attrelid = t.oid
         AND att.attnum = k.attnum
        WHERE att.attname = 'code'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(idx.indkey) k(attnum)
        JOIN pg_attribute att
          ON att.attrelid = t.oid
         AND att.attnum = k.attnum
        WHERE att.attname = 'labId'
      )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', row_record.index_name);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Build test -> lab usage map from real references
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE "tmp_test_lab_usage" (
  "testId" uuid NOT NULL,
  "labId" uuid NOT NULL,
  PRIMARY KEY ("testId", "labId")
) ON COMMIT DROP;

-- Existing scoped value (if already partially migrated).
INSERT INTO "tmp_test_lab_usage" ("testId", "labId")
SELECT t.id, t."labId"
FROM "tests" t
WHERE t."labId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Department-linked tests.
INSERT INTO "tmp_test_lab_usage" ("testId", "labId")
SELECT t.id, d."labId"
FROM "tests" t
JOIN "departments" d ON d.id = t."departmentId"
WHERE d."labId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Pricing-linked tests.
INSERT INTO "tmp_test_lab_usage" ("testId", "labId")
SELECT p."testId", p."labId"
FROM "pricing" p
WHERE p."testId" IS NOT NULL
  AND p."labId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Ordered tests.
INSERT INTO "tmp_test_lab_usage" ("testId", "labId")
SELECT ot."testId", o."labId"
FROM "order_tests" ot
JOIN "samples" s ON s.id = ot."sampleId"
JOIN "orders" o ON o.id = s."orderId"
WHERE ot."testId" IS NOT NULL
  AND o."labId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Instrument mapping usage (if table exists).
DO $$
BEGIN
  IF to_regclass('public.instrument_test_mappings') IS NOT NULL
     AND to_regclass('public.instruments') IS NOT NULL THEN
    INSERT INTO "tmp_test_lab_usage" ("testId", "labId")
    SELECT m."testId", i."labId"
    FROM "instrument_test_mappings" m
    JOIN "instruments" i ON i.id = m."instrumentId"
    WHERE m."testId" IS NOT NULL
      AND i."labId" IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Fallback for orphan tests: assign first lab.
INSERT INTO "tmp_test_lab_usage" ("testId", "labId")
SELECT t.id, first_lab.id
FROM "tests" t
CROSS JOIN LATERAL (
  SELECT l.id
  FROM "labs" l
  ORDER BY l."createdAt" ASC NULLS LAST, l.id ASC
  LIMIT 1
) first_lab
WHERE NOT EXISTS (
  SELECT 1
  FROM "tmp_test_lab_usage" u
  WHERE u."testId" = t.id
)
ON CONFLICT DO NOTHING;

-- If we still cannot resolve lab for existing tests, fail fast with clear message.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "tests")
     AND NOT EXISTS (SELECT 1 FROM "tmp_test_lab_usage") THEN
    RAISE EXCEPTION 'Cannot scope tests by lab because no labs were found.';
  END IF;
END $$;

-- Choose a primary lab for each existing test row and fill tests.labId.
CREATE TEMP TABLE "tmp_test_primary_lab" ON COMMIT DROP AS
SELECT DISTINCT ON (u."testId")
  u."testId",
  u."labId"
FROM "tmp_test_lab_usage" u
ORDER BY u."testId", u."labId"::text;

UPDATE "tests" t
SET "labId" = p."labId"
FROM "tmp_test_primary_lab" p
WHERE t.id = p."testId"
  AND t."labId" IS NULL;

-- -----------------------------------------------------------------------------
-- Map every (old test, lab) pair to a concrete target test id.
-- This prevents creating duplicate rows if a lab-specific test already exists.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE "tmp_test_target_map" (
  "oldTestId" uuid NOT NULL,
  "labId" uuid NOT NULL,
  "targetTestId" uuid NOT NULL,
  PRIMARY KEY ("oldTestId", "labId")
) ON COMMIT DROP;

-- Same-lab pairs keep original id.
INSERT INTO "tmp_test_target_map" ("oldTestId", "labId", "targetTestId")
SELECT t.id, u."labId", t.id
FROM "tmp_test_lab_usage" u
JOIN "tests" t ON t.id = u."testId"
WHERE t."labId" = u."labId"
ON CONFLICT DO NOTHING;

-- Reuse an already existing test with same code in target lab if present.
INSERT INTO "tmp_test_target_map" ("oldTestId", "labId", "targetTestId")
SELECT t.id, u."labId", existing.id
FROM "tmp_test_lab_usage" u
JOIN "tests" t ON t.id = u."testId"
JOIN "tests" existing
  ON existing."labId" = u."labId"
 AND existing."code" = t."code"
WHERE t."labId" <> u."labId"
ON CONFLICT DO NOTHING;

-- Remaining pairs need cloned test rows.
CREATE TEMP TABLE "tmp_test_clone_map" (
  "oldTestId" uuid NOT NULL,
  "labId" uuid NOT NULL,
  "newTestId" uuid NOT NULL,
  PRIMARY KEY ("oldTestId", "labId")
) ON COMMIT DROP;

INSERT INTO "tmp_test_clone_map" ("oldTestId", "labId", "newTestId")
SELECT u."testId", u."labId", gen_random_uuid()
FROM "tmp_test_lab_usage" u
LEFT JOIN "tmp_test_target_map" m
  ON m."oldTestId" = u."testId"
 AND m."labId" = u."labId"
WHERE m."oldTestId" IS NULL;

-- Clone rows for unresolved lab pairs.
INSERT INTO "tests" (
  "id",
  "labId",
  "code",
  "name",
  "type",
  "tubeType",
  "departmentId",
  "category",
  "unit",
  "normalMin",
  "normalMax",
  "normalMinMale",
  "normalMaxMale",
  "normalMinFemale",
  "normalMaxFemale",
  "normalText",
  "description",
  "childTestIds",
  "parameterDefinitions",
  "isActive",
  "sortOrder",
  "expectedCompletionMinutes",
  "createdAt",
  "updatedAt"
)
SELECT
  m."newTestId",
  m."labId",
  t."code",
  t."name",
  t."type",
  t."tubeType",
  target_dept.id,
  t."category",
  t."unit",
  t."normalMin",
  t."normalMax",
  t."normalMinMale",
  t."normalMaxMale",
  t."normalMinFemale",
  t."normalMaxFemale",
  t."normalText",
  t."description",
  t."childTestIds",
  t."parameterDefinitions",
  t."isActive",
  t."sortOrder",
  t."expectedCompletionMinutes",
  t."createdAt",
  t."updatedAt"
FROM "tmp_test_clone_map" m
JOIN "tests" t ON t.id = m."oldTestId"
LEFT JOIN "departments" source_dept ON source_dept.id = t."departmentId"
LEFT JOIN "departments" target_dept
  ON target_dept."labId" = m."labId"
 AND source_dept."code" IS NOT NULL
 AND target_dept."code" = source_dept."code";

-- Add clone rows into final mapping.
INSERT INTO "tmp_test_target_map" ("oldTestId", "labId", "targetTestId")
SELECT "oldTestId", "labId", "newTestId"
FROM "tmp_test_clone_map"
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Remap references to the lab-specific target test ids
-- -----------------------------------------------------------------------------
UPDATE "pricing" p
SET "testId" = m."targetTestId"
FROM "tmp_test_target_map" m
WHERE p."testId" = m."oldTestId"
  AND p."labId" = m."labId"
  AND p."testId" <> m."targetTestId";

UPDATE "order_tests" ot
SET "testId" = m."targetTestId"
FROM "tmp_test_target_map" m
WHERE ot."testId" = m."oldTestId"
  AND ot."labId" = m."labId"
  AND ot."testId" <> m."targetTestId";

DO $$
BEGIN
  IF to_regclass('public.instrument_test_mappings') IS NOT NULL
     AND to_regclass('public.instruments') IS NOT NULL THEN
    UPDATE "instrument_test_mappings" itm
    SET "testId" = m."targetTestId"
    FROM "tmp_test_target_map" m,
         "instruments" i
    WHERE itm."testId" = m."oldTestId"
      AND i.id = itm."instrumentId"
      AND i."labId" = m."labId"
      AND itm."testId" <> m."targetTestId";
  END IF;
END $$;

-- Ensure cloned/reused panel tests have matching component rows in target labs.
DO $$
BEGIN
  IF to_regclass('public.test_components') IS NOT NULL THEN
    INSERT INTO "test_components" (
      "panelTestId",
      "childTestId",
      "required",
      "sortOrder",
      "reportSection",
      "reportGroup",
      "effectiveFrom",
      "effectiveTo",
      "createdAt",
      "updatedAt"
    )
    SELECT
      panel_map."targetTestId",
      child_map."targetTestId",
      tc."required",
      tc."sortOrder",
      tc."reportSection",
      tc."reportGroup",
      tc."effectiveFrom",
      tc."effectiveTo",
      tc."createdAt",
      tc."updatedAt"
    FROM "test_components" tc
    JOIN "tmp_test_target_map" panel_map
      ON panel_map."oldTestId" = tc."panelTestId"
    JOIN "tmp_test_target_map" child_map
      ON child_map."oldTestId" = tc."childTestId"
     AND child_map."labId" = panel_map."labId"
    LEFT JOIN "test_components" existing
      ON existing."panelTestId" = panel_map."targetTestId"
     AND existing."childTestId" = child_map."targetTestId"
    WHERE existing."panelTestId" IS NULL;
  END IF;
END $$;

-- Final fallback if any null remains after mapping.
UPDATE "tests" t
SET "labId" = first_lab.id
FROM (
  SELECT l.id
  FROM "labs" l
  ORDER BY l."createdAt" ASC NULLS LAST, l.id ASC
  LIMIT 1
) first_lab
WHERE t."labId" IS NULL;

-- -----------------------------------------------------------------------------
-- Constraints / indexes
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tests_lab_code"
  ON "tests" ("labId", "code");

CREATE INDEX IF NOT EXISTS "IDX_tests_lab_active_sort"
  ON "tests" ("labId", "isActive", "sortOrder", "code");

ALTER TABLE "tests"
  ALTER COLUMN "labId" SET NOT NULL;

-- -----------------------------------------------------------------------------
-- RLS + grants for tests (strong tenant isolation at DB layer)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_lab_user')
     AND to_regprocedure('app.current_lab_id()') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "tests" TO app_lab_user;

    ALTER TABLE "tests" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "tests" FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "tests_tenant_isolation" ON "tests";
    CREATE POLICY "tests_tenant_isolation" ON "tests"
      FOR ALL TO app_lab_user
      USING ("labId" = app.current_lab_id())
      WITH CHECK ("labId" = app.current_lab_id());

    IF to_regclass('public.test_components') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "test_components" TO app_lab_user;

      ALTER TABLE "test_components" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "test_components" FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "test_components_tenant_isolation" ON "test_components";
      CREATE POLICY "test_components_tenant_isolation" ON "test_components"
        FOR ALL TO app_lab_user
        USING (
          EXISTS (
            SELECT 1
            FROM "tests" panel_test
            WHERE panel_test.id = "test_components"."panelTestId"
              AND panel_test."labId" = app.current_lab_id()
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1
            FROM "tests" panel_test
            WHERE panel_test.id = "test_components"."panelTestId"
              AND panel_test."labId" = app.current_lab_id()
          )
        );
    END IF;
  ELSE
    RAISE NOTICE 'Skipping tests RLS grants/policies (app_lab_user role or app.current_lab_id() missing).';
  END IF;
END $$;
