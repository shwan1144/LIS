-- Multi-tenant LIS SaaS foundation
-- Safe to run multiple times (idempotent where possible).
-- Includes:
-- 1) Schema extensions for lab-scoped auth + platform auth tables.
-- 2) Backfill of new labId columns.
-- 3) PostgreSQL RLS policies for tenant-isolated clinical tables.
-- 4) Dedicated DB roles for lab app traffic and platform admin traffic.

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Labs: subdomain routing support
-- -----------------------------------------------------------------------------
ALTER TABLE "labs"
  ADD COLUMN IF NOT EXISTS "subdomain" varchar(63);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_labs_subdomain_unique"
  ON "labs" ("subdomain")
  WHERE "subdomain" IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Users: lab-scoped usernames (same username can exist in different labs)
-- -----------------------------------------------------------------------------
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "labId" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'FK_users_labId_labs'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_labId_labs"
      FOREIGN KEY ("labId") REFERENCES "labs"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- Drop legacy global unique(username) constraints if present.
DO $$
DECLARE
  row_record record;
BEGIN
  FOR row_record IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'users'
      AND con.contype = 'u'
      AND EXISTS (
        SELECT 1
        FROM unnest(con.conkey) k(attnum)
        JOIN pg_attribute att
          ON att.attrelid = con.conrelid
         AND att.attnum = k.attnum
        WHERE att.attname = 'username'
      )
  LOOP
    IF row_record.conname <> 'UQ_users_lab_username' THEN
      EXECUTE format('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS %I', row_record.conname);
    END IF;
  END LOOP;
END $$;

-- Backfill users.labId from defaultLabId first, then from assignment table.
UPDATE "users"
SET "labId" = "defaultLabId"
WHERE "labId" IS NULL
  AND "defaultLabId" IS NOT NULL;

UPDATE "users" u
SET "labId" = x."labId"
FROM (
  SELECT DISTINCT ON ("userId")
    "userId",
    "labId"
  FROM "user_lab_assignments"
  WHERE "labId" IS NOT NULL
  ORDER BY "userId", "labId"
) x
WHERE u.id = x."userId"
  AND u."labId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_lab_username"
  ON "users" ("labId", "username")
  WHERE "labId" IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Sample + OrderTest: explicit labId for stricter tenant isolation
-- -----------------------------------------------------------------------------
ALTER TABLE "samples"
  ADD COLUMN IF NOT EXISTS "labId" uuid;

ALTER TABLE "order_tests"
  ADD COLUMN IF NOT EXISTS "labId" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_samples_labId_labs'
  ) THEN
    ALTER TABLE "samples"
      ADD CONSTRAINT "FK_samples_labId_labs"
      FOREIGN KEY ("labId") REFERENCES "labs"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_order_tests_labId_labs'
  ) THEN
    ALTER TABLE "order_tests"
      ADD CONSTRAINT "FK_order_tests_labId_labs"
      FOREIGN KEY ("labId") REFERENCES "labs"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

-- Backfill from parent order/sample data.
UPDATE "samples" s
SET "labId" = o."labId"
FROM "orders" o
WHERE s."orderId" = o.id
  AND (s."labId" IS NULL OR s."labId" <> o."labId");

UPDATE "order_tests" ot
SET "labId" = COALESCE(s."labId", o."labId")
FROM "samples" s
JOIN "orders" o ON o.id = s."orderId"
WHERE ot."sampleId" = s.id
  AND (
    ot."labId" IS NULL
    OR ot."labId" <> COALESCE(s."labId", o."labId")
  );

CREATE INDEX IF NOT EXISTS "IDX_samples_labId" ON "samples" ("labId");
CREATE INDEX IF NOT EXISTS "IDX_order_tests_labId" ON "order_tests" ("labId");

-- -----------------------------------------------------------------------------
-- Platform users: separate auth scope for admin.yourlis.com
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_users_role_enum') THEN
    CREATE TYPE "platform_users_role_enum" AS ENUM ('SUPER_ADMIN', 'AUDITOR');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "platform_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" varchar(255) NOT NULL,
  "passwordHash" varchar(255) NOT NULL,
  "role" "platform_users_role_enum" NOT NULL DEFAULT 'AUDITOR',
  "isActive" boolean NOT NULL DEFAULT true,
  "mfaSecret" varchar(255),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_platform_users_email"
  ON "platform_users" ("email");

-- -----------------------------------------------------------------------------
-- Refresh token rotation storage
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refresh_tokens_actortype_enum') THEN
    CREATE TYPE "refresh_tokens_actortype_enum" AS ENUM ('LAB_USER', 'PLATFORM_USER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" uuid PRIMARY KEY,
  "actorType" "refresh_tokens_actortype_enum" NOT NULL,
  "actorId" uuid NOT NULL,
  "familyId" uuid NOT NULL,
  "tokenHash" varchar(255) NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "revokedAt" timestamp NULL,
  "replacedByTokenId" uuid NULL,
  "context" jsonb NULL,
  "createdIp" varchar(45) NULL,
  "createdUserAgent" varchar(500) NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_actor"
  ON "refresh_tokens" ("actorType", "actorId");

CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_family"
  ON "refresh_tokens" ("familyId");

-- -----------------------------------------------------------------------------
-- Dedicated Result table for analyte-level historical entries
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "labId" uuid NOT NULL,
  "orderTestId" uuid NOT NULL,
  "analyteCode" varchar(64) NULL,
  "value" varchar(255) NULL,
  "unit" varchar(64) NULL,
  "flags" varchar(32) NULL,
  "enteredAt" timestamp NULL,
  "enteredByUserId" uuid NULL,
  "metadata" jsonb NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_results_labId_labs'
  ) THEN
    ALTER TABLE "results"
      ADD CONSTRAINT "FK_results_labId_labs"
      FOREIGN KEY ("labId") REFERENCES "labs"("id")
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_results_orderTestId_order_tests'
  ) THEN
    ALTER TABLE "results"
      ADD CONSTRAINT "FK_results_orderTestId_order_tests"
      FOREIGN KEY ("orderTestId") REFERENCES "order_tests"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_results_lab_order_test"
  ON "results" ("labId", "orderTestId");

CREATE INDEX IF NOT EXISTS "IDX_results_lab_entered_at"
  ON "results" ("labId", "enteredAt");

-- -----------------------------------------------------------------------------
-- AuditLog enhancements
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_logs_action_enum') THEN
    ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'REPORT_EXPORT';
    ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'PLATFORM_LOGIN';
    ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'PLATFORM_LOGIN_FAILED';
    ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'PLATFORM_IMPERSONATE_START';
    ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'PLATFORM_IMPERSONATE_STOP';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_logs_actortype_enum') THEN
    CREATE TYPE "audit_logs_actortype_enum" AS ENUM ('LAB_USER', 'PLATFORM_USER');
  END IF;
END $$;

ALTER TABLE "audit_logs"
  ADD COLUMN IF NOT EXISTS "actorType" "audit_logs_actortype_enum",
  ADD COLUMN IF NOT EXISTS "actorId" uuid;

CREATE INDEX IF NOT EXISTS "IDX_audit_actor_createdAt"
  ON "audit_logs" ("actorId", "createdAt");

-- -----------------------------------------------------------------------------
-- PostgreSQL RLS configuration
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_lab_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_lab_id', true), '')::uuid;
$$;

-- Dedicated roles used by the application.
-- NOTE: role creation requires DB permission; if not available, run these as DB admin.
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
      RAISE NOTICE 'Skipping ALTER ROLE ... BYPASSRLS (insufficient privilege).';
  END;
END $$;

GRANT USAGE ON SCHEMA public TO app_lab_user, app_platform_admin;
GRANT USAGE ON SCHEMA app TO app_lab_user, app_platform_admin;
GRANT EXECUTE ON FUNCTION app.current_lab_id() TO app_lab_user, app_platform_admin;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "users", "orders", "samples", "order_tests", "results" TO app_lab_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_platform_admin;

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "samples" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_tests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "results" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
ALTER TABLE "samples" FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_tests" FORCE ROW LEVEL SECURITY;
ALTER TABLE "results" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_tenant_isolation" ON "users";
CREATE POLICY "users_tenant_isolation" ON "users"
  FOR ALL TO app_lab_user
  USING ("labId" = app.current_lab_id())
  WITH CHECK ("labId" = app.current_lab_id());

DROP POLICY IF EXISTS "orders_tenant_isolation" ON "orders";
CREATE POLICY "orders_tenant_isolation" ON "orders"
  FOR ALL TO app_lab_user
  USING ("labId" = app.current_lab_id())
  WITH CHECK ("labId" = app.current_lab_id());

DROP POLICY IF EXISTS "samples_tenant_isolation" ON "samples";
CREATE POLICY "samples_tenant_isolation" ON "samples"
  FOR ALL TO app_lab_user
  USING ("labId" = app.current_lab_id())
  WITH CHECK ("labId" = app.current_lab_id());

DROP POLICY IF EXISTS "order_tests_tenant_isolation" ON "order_tests";
CREATE POLICY "order_tests_tenant_isolation" ON "order_tests"
  FOR ALL TO app_lab_user
  USING ("labId" = app.current_lab_id())
  WITH CHECK ("labId" = app.current_lab_id());

DROP POLICY IF EXISTS "results_tenant_isolation" ON "results";
CREATE POLICY "results_tenant_isolation" ON "results"
  FOR ALL TO app_lab_user
  USING ("labId" = app.current_lab_id())
  WITH CHECK ("labId" = app.current_lab_id());
