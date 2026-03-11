-- Grants + RLS for culture sensitivity tables introduced in 026.
-- Fixes app_lab_user access to "test_antibiotics" and enforces lab isolation.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_lab_user')
     AND to_regprocedure('app.current_lab_id()') IS NOT NULL THEN

    IF to_regclass('public.antibiotics') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "antibiotics" TO app_lab_user;

      ALTER TABLE "antibiotics" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "antibiotics" FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "antibiotics_tenant_isolation" ON "antibiotics";
      CREATE POLICY "antibiotics_tenant_isolation" ON "antibiotics"
        FOR ALL TO app_lab_user
        USING ("labId" = app.current_lab_id())
        WITH CHECK ("labId" = app.current_lab_id());
    END IF;

    IF to_regclass('public.test_antibiotics') IS NOT NULL
       AND to_regclass('public.tests') IS NOT NULL
       AND to_regclass('public.antibiotics') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "test_antibiotics" TO app_lab_user;

      ALTER TABLE "test_antibiotics" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "test_antibiotics" FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "test_antibiotics_tenant_isolation" ON "test_antibiotics";
      CREATE POLICY "test_antibiotics_tenant_isolation" ON "test_antibiotics"
        FOR ALL TO app_lab_user
        USING (
          EXISTS (
            SELECT 1
            FROM "tests" t
            JOIN "antibiotics" a
              ON a.id = "test_antibiotics"."antibioticId"
            WHERE t.id = "test_antibiotics"."testId"
              AND t."labId" = app.current_lab_id()
              AND a."labId" = app.current_lab_id()
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1
            FROM "tests" t
            JOIN "antibiotics" a
              ON a.id = "test_antibiotics"."antibioticId"
            WHERE t.id = "test_antibiotics"."testId"
              AND t."labId" = app.current_lab_id()
              AND a."labId" = app.current_lab_id()
          )
        );
    END IF;

  ELSE
    RAISE NOTICE 'Skipping 027 culture sensitivity grants/policies (app_lab_user role or app.current_lab_id() missing).';
  END IF;
END $$;
