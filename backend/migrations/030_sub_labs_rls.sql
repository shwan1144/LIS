-- Grants + RLS for sub-lab tables introduced in 029.
-- Fixes app_lab_user access for order joins, sub-lab settings, and pricing lookup.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform_admin') THEN
    IF to_regclass('public.sub_labs') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "sub_labs" TO app_platform_admin;
    END IF;

    IF to_regclass('public.sub_lab_test_prices') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "sub_lab_test_prices" TO app_platform_admin;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_lab_user')
     AND to_regprocedure('app.current_lab_id()') IS NOT NULL THEN

    IF to_regclass('public.sub_labs') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "sub_labs" TO app_lab_user;

      ALTER TABLE "sub_labs" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "sub_labs" FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "sub_labs_tenant_isolation" ON "sub_labs";
      CREATE POLICY "sub_labs_tenant_isolation" ON "sub_labs"
        FOR ALL TO app_lab_user
        USING ("labId" = app.current_lab_id())
        WITH CHECK ("labId" = app.current_lab_id());
    END IF;

    IF to_regclass('public.sub_lab_test_prices') IS NOT NULL
       AND to_regclass('public.sub_labs') IS NOT NULL
       AND to_regclass('public.tests') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "sub_lab_test_prices" TO app_lab_user;

      ALTER TABLE "sub_lab_test_prices" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "sub_lab_test_prices" FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "sub_lab_test_prices_tenant_isolation" ON "sub_lab_test_prices";
      CREATE POLICY "sub_lab_test_prices_tenant_isolation" ON "sub_lab_test_prices"
        FOR ALL TO app_lab_user
        USING (
          EXISTS (
            SELECT 1
            FROM "sub_labs" sl
            JOIN "tests" t
              ON t.id = "sub_lab_test_prices"."testId"
            WHERE sl.id = "sub_lab_test_prices"."subLabId"
              AND sl."labId" = app.current_lab_id()
              AND t."labId" = app.current_lab_id()
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1
            FROM "sub_labs" sl
            JOIN "tests" t
              ON t.id = "sub_lab_test_prices"."testId"
            WHERE sl.id = "sub_lab_test_prices"."subLabId"
              AND sl."labId" = app.current_lab_id()
              AND t."labId" = app.current_lab_id()
          )
        );
    END IF;

  ELSE
    RAISE NOTICE 'Skipping 030 sub-lab grants/policies (app_lab_user role or app.current_lab_id() missing).';
  END IF;
END $$;
