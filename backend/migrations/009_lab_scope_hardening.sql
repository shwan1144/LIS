-- Harden lab-scope isolation for shifts/departments/instruments/pricing and
-- lab-scoped operational tables.
-- Adds DB constraints + RLS policies (when app_lab_user/app.current_lab_id() exist).

-- -----------------------------------------------------------------------------
-- Per-lab uniqueness hardening
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.instruments') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM (
        SELECT "labId", "code", COUNT(*) AS cnt
        FROM "instruments"
        GROUP BY "labId", "code"
        HAVING COUNT(*) > 1
      ) d
    ) THEN
      RAISE EXCEPTION 'Duplicate instruments found for same lab/code. Resolve duplicates before applying 009_lab_scope_hardening.sql';
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS "UQ_instruments_lab_code"
      ON "instruments" ("labId", "code");
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.instrument_test_mappings') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM (
        SELECT "instrumentId", "instrumentTestCode", COUNT(*) AS cnt
        FROM "instrument_test_mappings"
        GROUP BY "instrumentId", "instrumentTestCode"
        HAVING COUNT(*) > 1
      ) d
    ) THEN
      RAISE EXCEPTION 'Duplicate instrument test mappings found for same instrument/code. Resolve duplicates before applying 009_lab_scope_hardening.sql';
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS "UQ_instrument_test_mappings_instrument_code"
      ON "instrument_test_mappings" ("instrumentId", "instrumentTestCode");
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Tube sequence settings validity (per lab)
-- -----------------------------------------------------------------------------
UPDATE "labs"
SET "labelSequenceBy" = 'tube_type'
WHERE "labelSequenceBy" IS NULL
   OR "labelSequenceBy" NOT IN ('tube_type', 'department');

UPDATE "labs"
SET "sequenceResetBy" = 'day'
WHERE "sequenceResetBy" IS NULL
   OR "sequenceResetBy" NOT IN ('day', 'shift');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'CHK_labs_label_sequence_by'
  ) THEN
    ALTER TABLE "labs"
      ADD CONSTRAINT "CHK_labs_label_sequence_by"
      CHECK ("labelSequenceBy" IN ('tube_type', 'department'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'CHK_labs_sequence_reset_by'
  ) THEN
    ALTER TABLE "labs"
      ADD CONSTRAINT "CHK_labs_sequence_reset_by"
      CHECK ("sequenceResetBy" IN ('day', 'shift'));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- RLS policies for additional lab-scoped tables
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_lab_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_lab_id', true), '')::uuid;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_lab_user') THEN
    CREATE ROLE app_lab_user NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform_admin') THEN
    CREATE ROLE app_platform_admin NOLOGIN;
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER ROLE app_platform_admin BYPASSRLS';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping ALTER ROLE app_platform_admin BYPASSRLS (insufficient privilege).';
  END;
END $$;

GRANT USAGE ON SCHEMA app TO app_lab_user, app_platform_admin;
GRANT EXECUTE ON FUNCTION app.current_lab_id() TO app_lab_user, app_platform_admin;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_lab_user')
     AND to_regprocedure('app.current_lab_id()') IS NOT NULL THEN

    IF to_regclass('public.shifts') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "shifts" TO app_lab_user;
      ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "shifts" FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "shifts_tenant_isolation" ON "shifts";
      CREATE POLICY "shifts_tenant_isolation" ON "shifts"
        FOR ALL TO app_lab_user
        USING ("labId" = app.current_lab_id())
        WITH CHECK ("labId" = app.current_lab_id());
    END IF;

    IF to_regclass('public.departments') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "departments" TO app_lab_user;
      ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "departments" FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "departments_tenant_isolation" ON "departments";
      CREATE POLICY "departments_tenant_isolation" ON "departments"
        FOR ALL TO app_lab_user
        USING ("labId" = app.current_lab_id())
        WITH CHECK ("labId" = app.current_lab_id());
    END IF;

    IF to_regclass('public.instruments') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "instruments" TO app_lab_user;
      ALTER TABLE "instruments" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "instruments" FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "instruments_tenant_isolation" ON "instruments";
      CREATE POLICY "instruments_tenant_isolation" ON "instruments"
        FOR ALL TO app_lab_user
        USING ("labId" = app.current_lab_id())
        WITH CHECK ("labId" = app.current_lab_id());
    END IF;

    IF to_regclass('public.pricing') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "pricing" TO app_lab_user;
      ALTER TABLE "pricing" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "pricing" FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "pricing_tenant_isolation" ON "pricing";
      CREATE POLICY "pricing_tenant_isolation" ON "pricing"
        FOR ALL TO app_lab_user
        USING ("labId" = app.current_lab_id())
        WITH CHECK ("labId" = app.current_lab_id());
    END IF;

    IF to_regclass('public.lab_orders_worklist') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "lab_orders_worklist" TO app_lab_user;
      ALTER TABLE "lab_orders_worklist" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "lab_orders_worklist" FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "lab_orders_worklist_tenant_isolation" ON "lab_orders_worklist";
      CREATE POLICY "lab_orders_worklist_tenant_isolation" ON "lab_orders_worklist"
        FOR ALL TO app_lab_user
        USING ("labId" = app.current_lab_id())
        WITH CHECK ("labId" = app.current_lab_id());
    END IF;

    IF to_regclass('public.instrument_test_mappings') IS NOT NULL
       AND to_regclass('public.instruments') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "instrument_test_mappings" TO app_lab_user;
      ALTER TABLE "instrument_test_mappings" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "instrument_test_mappings" FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "instrument_test_mappings_tenant_isolation" ON "instrument_test_mappings";
      CREATE POLICY "instrument_test_mappings_tenant_isolation" ON "instrument_test_mappings"
        FOR ALL TO app_lab_user
        USING (
          EXISTS (
            SELECT 1
            FROM "instruments" i
            WHERE i.id = "instrument_test_mappings"."instrumentId"
              AND i."labId" = app.current_lab_id()
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1
            FROM "instruments" i
            WHERE i.id = "instrument_test_mappings"."instrumentId"
              AND i."labId" = app.current_lab_id()
          )
        );
    END IF;

    IF to_regclass('public.instrument_messages') IS NOT NULL
       AND to_regclass('public.instruments') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "instrument_messages" TO app_lab_user;
      ALTER TABLE "instrument_messages" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "instrument_messages" FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "instrument_messages_tenant_isolation" ON "instrument_messages";
      CREATE POLICY "instrument_messages_tenant_isolation" ON "instrument_messages"
        FOR ALL TO app_lab_user
        USING (
          EXISTS (
            SELECT 1
            FROM "instruments" i
            WHERE i.id = "instrument_messages"."instrumentId"
              AND i."labId" = app.current_lab_id()
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1
            FROM "instruments" i
            WHERE i.id = "instrument_messages"."instrumentId"
              AND i."labId" = app.current_lab_id()
          )
        );
    END IF;
  ELSE
    RAISE NOTICE 'Skipping 009 RLS policies (app_lab_user role or app.current_lab_id() missing).';
  END IF;
END $$;
