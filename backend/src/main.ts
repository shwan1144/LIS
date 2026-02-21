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
import { AppModule } from './app.module';
import { runSeed } from './seed';
import { DataSource } from 'typeorm';

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

  if (baseRules.length === 0) {
    baseRules.push('http://localhost:5173');
  }

  if (process.env.NODE_ENV !== 'production') {
    for (const rule of DEV_CORS_RULES) {
      baseRules.push(normalizeOrigin(rule));
    }
  }

  return Array.from(new Set(baseRules));
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
  if (process.env.AUTO_SEED_ON_BOOT === 'true') {
    return true;
  }
  if (process.env.AUTO_SEED_ON_BOOT === 'false') {
    return false;
  }
  return process.env.NODE_ENV === 'production';
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
    `UPDATE "labs" SET "printMethod" = 'browser' WHERE "printMethod" IS NULL`,
    'ALTER TABLE IF EXISTS "tests" ADD COLUMN IF NOT EXISTS "numericAgeRanges" jsonb',
    `ALTER TABLE IF EXISTS "tests" ADD COLUMN IF NOT EXISTS "resultEntryType" varchar(16) NOT NULL DEFAULT 'NUMERIC'`,
    'ALTER TABLE IF EXISTS "tests" ADD COLUMN IF NOT EXISTS "resultTextOptions" jsonb',
    'ALTER TABLE IF EXISTS "tests" ADD COLUMN IF NOT EXISTS "allowCustomResultText" boolean NOT NULL DEFAULT false',
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
          'tests',
          'test_components',
          'shifts',
          'departments',
          'instruments',
          'pricing',
          'lab_orders_worklist',
          'instrument_test_mappings',
          'instrument_messages',
          'user_lab_assignments'
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

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
    await ensureTenantRolePrivileges(dataSource);
  } catch (error) {
    bootstrapLogger.warn(
      `Failed to auto-ensure tenant role privileges: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (shouldAutoSeedOnBoot()) {
    await runSeed({ synchronizeSchema: false });
  }

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  const corsRules = parseCorsRules();
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
