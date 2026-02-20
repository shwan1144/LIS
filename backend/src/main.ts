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
  ];

  for (const sql of sqlStatements) {
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
