-- Extend lab-role grants and RLS policies for additional operational tables.
-- This keeps automatic per-request DB role enforcement compatible with existing lab endpoints.

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
END $$;

GRANT USAGE ON SCHEMA app TO app_lab_user;
GRANT EXECUTE ON FUNCTION app.current_lab_id() TO app_lab_user;

-- Shared patient registry is global by design.
DO $$
BEGIN
  IF to_regclass('public.patients') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE "patients" TO app_lab_user;
  END IF;
END $$;

-- Audit logs are lab-visible only inside current lab scope.
DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    GRANT SELECT, INSERT ON TABLE "audit_logs" TO app_lab_user;

    ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "audit_logs_tenant_isolation" ON "audit_logs";
    CREATE POLICY "audit_logs_tenant_isolation" ON "audit_logs"
      FOR ALL TO app_lab_user
      USING ("labId" = app.current_lab_id())
      WITH CHECK ("labId" = app.current_lab_id());
  END IF;
END $$;

-- User-lab assignments are tenant-isolated by labId.
DO $$
BEGIN
  IF to_regclass('public.user_lab_assignments') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "user_lab_assignments" TO app_lab_user;

    ALTER TABLE "user_lab_assignments" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "user_lab_assignments" FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "user_lab_assignments_tenant_isolation" ON "user_lab_assignments";
    CREATE POLICY "user_lab_assignments_tenant_isolation" ON "user_lab_assignments"
      FOR ALL TO app_lab_user
      USING ("labId" = app.current_lab_id())
      WITH CHECK ("labId" = app.current_lab_id());
  END IF;
END $$;

-- Result history rows inherit tenancy from parent order_tests.labId.
DO $$
BEGIN
  IF to_regclass('public.order_test_result_history') IS NOT NULL
     AND to_regclass('public.order_tests') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "order_test_result_history" TO app_lab_user;

    ALTER TABLE "order_test_result_history" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "order_test_result_history" FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "order_test_result_history_tenant_isolation" ON "order_test_result_history";
    CREATE POLICY "order_test_result_history_tenant_isolation" ON "order_test_result_history"
      FOR ALL TO app_lab_user
      USING (
        EXISTS (
          SELECT 1
          FROM "order_tests" ot
          WHERE ot.id = "order_test_result_history"."orderTestId"
            AND ot."labId" = app.current_lab_id()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM "order_tests" ot
          WHERE ot.id = "order_test_result_history"."orderTestId"
            AND ot."labId" = app.current_lab_id()
        )
      );
  END IF;
END $$;

-- Unmatched instrument inbox rows inherit tenancy from instruments.labId.
DO $$
BEGIN
  IF to_regclass('public.unmatched_instrument_results') IS NOT NULL
     AND to_regclass('public.instruments') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "unmatched_instrument_results" TO app_lab_user;

    ALTER TABLE "unmatched_instrument_results" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "unmatched_instrument_results" FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "unmatched_instrument_results_tenant_isolation" ON "unmatched_instrument_results";
    CREATE POLICY "unmatched_instrument_results_tenant_isolation" ON "unmatched_instrument_results"
      FOR ALL TO app_lab_user
      USING (
        EXISTS (
          SELECT 1
          FROM "instruments" i
          WHERE i.id = "unmatched_instrument_results"."instrumentId"
            AND i."labId" = app.current_lab_id()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM "instruments" i
          WHERE i.id = "unmatched_instrument_results"."instrumentId"
            AND i."labId" = app.current_lab_id()
        )
      );
  END IF;
END $$;
