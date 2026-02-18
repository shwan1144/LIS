// Load .env FIRST using require (executes synchronously before imports)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
// Fallback: try current working directory if .env not found
if (!process.env.DB_PASSWORD && !process.env.DATABASE_URL) {
  require('dotenv').config();
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { runSeed } from './seed';

function shouldAutoSeedOnBoot(): boolean {
  if (process.env.AUTO_SEED_ON_BOOT === 'true') {
    return true;
  }
  if (process.env.AUTO_SEED_ON_BOOT === 'false') {
    return false;
  }
  return process.env.NODE_ENV === 'production';
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
