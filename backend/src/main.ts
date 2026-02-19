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
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
