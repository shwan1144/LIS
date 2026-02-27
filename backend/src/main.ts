// Load .env FIRST using require (executes synchronously before imports)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
// Fallback: try current working directory if .env not found
if (!process.env.DB_PASSWORD && !process.env.DATABASE_URL) {
  require('dotenv').config();
}

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { runSeed } from './seed';
import { DataSource } from 'typeorm';
import { assertRequiredProductionEnv, isRlsStrictModeEnabled } from './config/security-env';

const bootstrapLogger = new Logger('Bootstrap');

const DEV_CORS_RULES = [
  'http://localhost:*',
  'http://127.0.0.1:*',
  'http://*.localhost:*',
  'https://localhost:*',
  'https://127.0.0.1:*',
  'https://*.localhost:*',
];

function normalizeOrigin(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

function parseCorsRules(): string[] {
  const raw = (process.env.CORS_ORIGIN || '').trim();
  const baseRules = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(normalizeOrigin);

  if (baseRules.length === 0 && process.env.NODE_ENV !== 'production') {
    baseRules.push('http://localhost:5173');
  }

  if (process.env.NODE_ENV !== 'production') {
    for (const rule of DEV_CORS_RULES) {
      baseRules.push(normalizeOrigin(rule));
    }
  }

  return Array.from(new Set(baseRules));
}

function validateCorsRules(rules: string[]): void {
  const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';
  if (!isProduction) {
    return;
  }

  if (rules.length === 0) {
    throw new Error(
      '[SECURITY] CORS_ORIGIN must be explicitly configured in production.',
    );
  }

  if (rules.includes('*')) {
    throw new Error(
      '[SECURITY] CORS_ORIGIN cannot include "*" in production when credentials are enabled.',
    );
  }
}

function isOriginAllowed(origin: string, rules: string[]): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  return rules.some((rule) => {
    if (rule === '*') return true;
    if (!rule.includes('*')) return normalizedOrigin === rule;
    const escaped = rule
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i').test(normalizedOrigin);
  });
}

function shouldAutoSeedOnBoot(): boolean {
  return process.env.AUTO_SEED_ON_BOOT === 'true';
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 't' || normalized === '1';
  }
  if (typeof value === 'number') return value === 1;
  return false;
}

async function ensureReportBrandingColumns(dataSource: DataSource): Promise<void> {
  const sqlStatements = [
    'ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "reportBannerDataUrl" text',
    'ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "reportFooterDataUrl" text',
    'ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "reportLogoDataUrl" text',
    'ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "reportWatermarkDataUrl" text',
    'ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "onlineResultWatermarkDataUrl" text',
    'ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "onlineResultWatermarkText" varchar(120)',
    `ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "printMethod" varchar(16) NOT NULL DEFAULT 'browser'`,
    'ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "receiptPrinterName" varchar(128)',
    'ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "labelsPrinterName" varchar(128)',
    'ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "reportPrinterName" varchar(128)',
    'ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "uiTestGroups" jsonb',
    `UPDATE "labs" SET "printMethod" = 'browser' WHERE "printMethod" IS NULL`,
    `
      DO $$
      BEGIN
        IF to_regclass('public.samples') IS NOT NULL THEN
          DROP INDEX IF EXISTS "UQ_samples_lab_barcode";
          CREATE INDEX IF NOT EXISTS "IDX_samples_lab_barcode"
            ON "samples" ("labId", "barcode")
            WHERE "barcode" IS NOT NULL;
        END IF;
      END $$;
    `,
    'ALTER TABLE IF EXISTS "tests" ADD COLUMN IF NOT EXISTS "numericAgeRanges" jsonb',
    `ALTER TABLE IF EXISTS "tests" ADD COLUMN IF NOT EXISTS "resultEntryType" varchar(16) NOT NULL DEFAULT 'NUMERIC'`,
    'ALTER TABLE IF EXISTS "tests" ADD COLUMN IF NOT EXISTS "resultTextOptions" jsonb',
    'ALTER TABLE IF EXISTS "tests" ADD COLUMN IF NOT EXISTS "allowCustomResultText" boolean NOT NULL DEFAULT false',
    'ALTER TABLE IF EXISTS "tests" ADD COLUMN IF NOT EXISTS "abbreviation" varchar(32)',
    `
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
    `,
  ];

  for (const sql of sqlStatements) {
    await dataSource.query(sql);
  }
}

async function ensureOrderFlowPerformanceIndexes(dataSource: DataSource): Promise<void> {
  const sqlStatements = [
    `
      DO $$
      BEGIN
        IF to_regclass('public.orders') IS NOT NULL THEN
          CREATE INDEX IF NOT EXISTS "IDX_orders_lab_registered_at"
            ON "orders" ("labId", "registeredAt" DESC);
          CREATE INDEX IF NOT EXISTS "IDX_orders_lab_status_registered_at"
            ON "orders" ("labId", "status", "registeredAt" DESC);
        END IF;
      END $$;
    `,
    `
      DO $$
      BEGIN
        IF to_regclass('public.samples') IS NOT NULL THEN
          CREATE INDEX IF NOT EXISTS "IDX_samples_order_id"
            ON "samples" ("orderId");
        END IF;
      END $$;
    `,
    `
      DO $$
      BEGIN
        IF to_regclass('public.order_tests') IS NOT NULL THEN
          CREATE INDEX IF NOT EXISTS "IDX_order_tests_sample_status_parent"
            ON "order_tests" ("sampleId", "status", "parentOrderTestId");
        END IF;
      END $$;
    `,
  ];

  for (const sql of sqlStatements) {
    await dataSource.query(sql);
  }
}

async function ensureTenantRolePrivileges(dataSource: DataSource): Promise<void> {
  const roleBootstrapStatements = [
    `
      CREATE SCHEMA IF NOT EXISTS app
    `,
    `
      CREATE OR REPLACE FUNCTION app.current_lab_id()
      RETURNS uuid
      LANGUAGE sql
      STABLE
      AS $$
        SELECT NULLIF(current_setting('app.current_lab_id', true), '')::uuid;
      $$;
    `,
    `
      CREATE TABLE IF NOT EXISTS "lab_counters" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "labId" uuid NOT NULL,
        "counterType" varchar(64) NOT NULL,
        "scopeKey" varchar(128) NOT NULL DEFAULT '__default__',
        "dateKey" date NOT NULL,
        "shiftId" uuid NULL,
        "shiftScopeKey" varchar(36) NOT NULL DEFAULT '',
        "value" bigint NOT NULL DEFAULT 0,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `,
    `
      DO $$
      BEGIN
        IF to_regclass('public.lab_counters') IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'FK_lab_counters_labId_labs'
          ) THEN
            ALTER TABLE "lab_counters"
              ADD CONSTRAINT "FK_lab_counters_labId_labs"
              FOREIGN KEY ("labId") REFERENCES "labs"("id")
              ON DELETE CASCADE;
          END IF;

          IF to_regclass('public.shifts') IS NOT NULL
             AND NOT EXISTS (
               SELECT 1
               FROM pg_constraint
               WHERE conname = 'FK_lab_counters_shiftId_shifts'
             ) THEN
            ALTER TABLE "lab_counters"
              ADD CONSTRAINT "FK_lab_counters_shiftId_shifts"
              FOREIGN KEY ("shiftId") REFERENCES "shifts"("id")
              ON DELETE SET NULL;
          END IF;
        END IF;
      END $$;
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_lab_counters_scope"
      ON "lab_counters" ("labId", "counterType", "scopeKey", "dateKey", "shiftScopeKey")
    `,
    `
      CREATE INDEX IF NOT EXISTS "IDX_lab_counters_lab_date"
      ON "lab_counters" ("labId", "dateKey")
    `,
    `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_lab_user') THEN
          CREATE ROLE app_lab_user NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform_admin') THEN
          CREATE ROLE app_platform_admin NOLOGIN;
        END IF;
      END $$;
    `,
    `
      DO $$
      BEGIN
        BEGIN
          EXECUTE 'ALTER ROLE app_platform_admin BYPASSRLS';
        EXCEPTION
          WHEN insufficient_privilege THEN
            RAISE NOTICE 'Skipping ALTER ROLE app_platform_admin BYPASSRLS (insufficient privilege).';
        END;
      END $$;
    `,
    `
      GRANT USAGE ON SCHEMA public TO app_lab_user, app_platform_admin
    `,
    `
      GRANT USAGE ON SCHEMA app TO app_lab_user, app_platform_admin
    `,
    `
      GRANT EXECUTE ON FUNCTION app.current_lab_id() TO app_lab_user, app_platform_admin
    `,
    `
      DO $$
      BEGIN
        BEGIN
          EXECUTE format('GRANT app_lab_user TO %I', current_user);
        EXCEPTION
          WHEN insufficient_privilege THEN
            RAISE NOTICE 'Skipping GRANT app_lab_user TO % (insufficient privilege).', current_user;
        END;
        BEGIN
          EXECUTE format('GRANT app_platform_admin TO %I', current_user);
        EXCEPTION
          WHEN insufficient_privilege THEN
            RAISE NOTICE 'Skipping GRANT app_platform_admin TO % (insufficient privilege).', current_user;
        END;
      END $$;
    `,
    `
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_platform_admin
    `,
    `
      GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_platform_admin
    `,
    `
      DO $$
      DECLARE
        table_name text;
      BEGIN
        FOREACH table_name IN ARRAY ARRAY[
          'labs',
          'users',
          'orders',
          'samples',
          'order_tests',
          'results',
          'lab_counters',
          'refresh_tokens',
          'admin_lab_portal_tokens',
          'tests',
          'test_components',
          'shifts',
          'departments',
          'instruments',
          'pricing',
          'lab_orders_worklist',
          'instrument_test_mappings',
          'instrument_messages',
          'user_lab_assignments',
          'user_department_assignments',
          'user_shift_assignments',
          'order_test_result_history',
          'unmatched_instrument_results'
        ]
        LOOP
          IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO app_lab_user', table_name);
          END IF;
        END LOOP;
      END $$;
    `,
    `
      DO $$
      BEGIN
        IF to_regclass('public.patients') IS NOT NULL THEN
          GRANT SELECT, INSERT, UPDATE ON TABLE "patients" TO app_lab_user;
        END IF;
      END $$;
    `,
    `
      DO $$
      BEGIN
        IF to_regclass('public.lab_counters') IS NOT NULL THEN
          ALTER TABLE "lab_counters" ENABLE ROW LEVEL SECURITY;
          ALTER TABLE "lab_counters" FORCE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "lab_counters_tenant_isolation" ON "lab_counters";
          CREATE POLICY "lab_counters_tenant_isolation" ON "lab_counters"
            FOR ALL TO app_lab_user
            USING ("labId" = app.current_lab_id())
            WITH CHECK ("labId" = app.current_lab_id());
        END IF;

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

        IF to_regclass('public.order_test_result_history') IS NOT NULL
           AND to_regclass('public.order_tests') IS NOT NULL THEN
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

        IF to_regclass('public.user_department_assignments') IS NOT NULL
           AND to_regclass('public.departments') IS NOT NULL THEN
          ALTER TABLE "user_department_assignments" ENABLE ROW LEVEL SECURITY;
          ALTER TABLE "user_department_assignments" FORCE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "user_department_assignments_tenant_isolation" ON "user_department_assignments";
          CREATE POLICY "user_department_assignments_tenant_isolation" ON "user_department_assignments"
            FOR ALL TO app_lab_user
            USING (
              EXISTS (
                SELECT 1
                FROM "departments" d
                WHERE d.id = "user_department_assignments"."departmentId"
                  AND d."labId" = app.current_lab_id()
              )
            )
            WITH CHECK (
              EXISTS (
                SELECT 1
                FROM "departments" d
                WHERE d.id = "user_department_assignments"."departmentId"
                  AND d."labId" = app.current_lab_id()
              )
            );
        END IF;

        IF to_regclass('public.user_shift_assignments') IS NOT NULL
           AND to_regclass('public.shifts') IS NOT NULL THEN
          ALTER TABLE "user_shift_assignments" ENABLE ROW LEVEL SECURITY;
          ALTER TABLE "user_shift_assignments" FORCE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "user_shift_assignments_tenant_isolation" ON "user_shift_assignments";
          CREATE POLICY "user_shift_assignments_tenant_isolation" ON "user_shift_assignments"
            FOR ALL TO app_lab_user
            USING (
              EXISTS (
                SELECT 1
                FROM "shifts" s
                WHERE s.id = "user_shift_assignments"."shiftId"
                  AND s."labId" = app.current_lab_id()
              )
            )
            WITH CHECK (
              EXISTS (
                SELECT 1
                FROM "shifts" s
                WHERE s.id = "user_shift_assignments"."shiftId"
                  AND s."labId" = app.current_lab_id()
              )
            );
        END IF;

        IF to_regclass('public.unmatched_instrument_results') IS NOT NULL
           AND to_regclass('public.instruments') IS NOT NULL THEN
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
    `,
    `
      DO $$
      BEGIN
        BEGIN
          EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_platform_admin',
            current_user
          );
        EXCEPTION
          WHEN insufficient_privilege THEN
            RAISE NOTICE 'Skipping ALTER DEFAULT PRIVILEGES for app_platform_admin tables (insufficient privilege).';
        END;
        BEGIN
          EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_platform_admin',
            current_user
          );
        EXCEPTION
          WHEN insufficient_privilege THEN
            RAISE NOTICE 'Skipping ALTER DEFAULT PRIVILEGES for app_platform_admin sequences (insufficient privilege).';
        END;
      END $$;
    `,
  ];

  for (const sql of roleBootstrapStatements) {
    await dataSource.query(sql);
  }
}

async function assertTenantRoleReadiness(dataSource: DataSource): Promise<void> {
  const rows = await dataSource.query(
    `
      SELECT
        EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'app_lab_user') AS "labRoleExists",
        EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'app_platform_admin') AS "platformRoleExists",
        pg_has_role(current_user, 'app_lab_user', 'MEMBER') AS "canSetLabRole",
        pg_has_role(current_user, 'app_platform_admin', 'MEMBER') AS "canSetPlatformRole",
        to_regprocedure('app.current_lab_id()') IS NOT NULL AS "hasCurrentLabFunction",
        CASE
          WHEN to_regclass('public.labs') IS NULL THEN true
          ELSE has_table_privilege('app_platform_admin', 'public.labs', 'SELECT')
        END AS "platformHasLabsSelect"
    `,
  ) as Array<{
    labRoleExists: unknown;
    platformRoleExists: unknown;
    canSetLabRole: unknown;
    canSetPlatformRole: unknown;
    hasCurrentLabFunction: unknown;
    platformHasLabsSelect: unknown;
  }>;

  const row = rows[0] ?? {};
  const failures: string[] = [];

  if (!toBoolean(row.labRoleExists)) {
    failures.push('role app_lab_user does not exist');
  }
  if (!toBoolean(row.platformRoleExists)) {
    failures.push('role app_platform_admin does not exist');
  }
  if (!toBoolean(row.canSetLabRole)) {
    failures.push('current DB user is not a member of app_lab_user');
  }
  if (!toBoolean(row.canSetPlatformRole)) {
    failures.push('current DB user is not a member of app_platform_admin');
  }
  if (!toBoolean(row.hasCurrentLabFunction)) {
    failures.push('function app.current_lab_id() is missing');
  }
  if (!toBoolean(row.platformHasLabsSelect)) {
    failures.push('app_platform_admin lacks SELECT on public.labs');
  }

  if (failures.length > 0) {
    throw new Error(
      `[SECURITY][RLS] Strict startup check failed: ${failures.join('; ')}.`,
    );
  }
}

async function bootstrap() {
  assertRequiredProductionEnv(['JWT_SECRET', 'PLATFORM_JWT_SECRET'], 'bootstrap');
  const app = await NestFactory.create(AppModule);
  const strictRlsMode = isRlsStrictModeEnabled();
  bootstrapLogger.log(`RLS strict mode: ${strictRlsMode ? 'enabled' : 'disabled'}`);
  const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || '1', 10);
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', Number.isFinite(trustProxyHops) && trustProxyHops > 0 ? trustProxyHops : 1);
  bootstrapLogger.log(`trust proxy configured to ${String(expressApp.get('trust proxy'))}`);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  const dataSource = app.get(DataSource);
  try {
    await ensureReportBrandingColumns(dataSource);
  } catch (error) {
    bootstrapLogger.warn(
      `Failed to auto-ensure report branding columns: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    await ensureOrderFlowPerformanceIndexes(dataSource);
  } catch (error) {
    bootstrapLogger.warn(
      `Failed to auto-ensure order-flow performance indexes: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    await ensureTenantRolePrivileges(dataSource);
  } catch (error) {
    bootstrapLogger.warn(
      `Failed to auto-ensure tenant role privileges: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (strictRlsMode) {
    await assertTenantRoleReadiness(dataSource);
  }

  if (shouldAutoSeedOnBoot()) {
    await runSeed({ synchronizeSchema: false });
  }

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  const corsRules = parseCorsRules();
  validateCorsRules(corsRules);
  bootstrapLogger.log(`CORS rules: ${corsRules.join(', ')}`);
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (isOriginAllowed(origin, corsRules)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
