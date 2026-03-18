-- Migration 033: Create report_themes table with RLS support.

CREATE TABLE IF NOT EXISTS "report_themes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "labId" uuid NOT NULL REFERENCES "labs"("id") ON DELETE CASCADE,
  "name" varchar(128) NOT NULL,
  "reportStyle" jsonb NOT NULL,
  "reportBranding" jsonb NOT NULL,
  "onlineResultWatermarkDataUrl" text,
  "onlineResultWatermarkText" varchar(120),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- Index for faster lookups by lab
CREATE INDEX IF NOT EXISTS "idx_report_themes_labId" ON "report_themes"("labId");

-- Grants + RLS
DO $$
BEGIN
  -- app_platform_admin (Super Admin)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform_admin') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "report_themes" TO app_platform_admin;
  END IF;

  -- app_lab_user (Lab Admin/Staff)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_lab_user')
     AND to_regprocedure('app.current_lab_id()') IS NOT NULL THEN
    
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "report_themes" TO app_lab_user;

    ALTER TABLE "report_themes" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "report_themes" FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "report_themes_tenant_isolation" ON "report_themes";
    CREATE POLICY "report_themes_tenant_isolation" ON "report_themes"
      FOR ALL TO app_lab_user
      USING ("labId" = app.current_lab_id())
      WITH CHECK ("labId" = app.current_lab_id());
  ELSE
    RAISE NOTICE 'Skipping 033 report_themes grants/policies (role or function missing).';
  END IF;
END $$;
