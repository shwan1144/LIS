ALTER TABLE IF EXISTS "orders"
  ADD COLUMN IF NOT EXISTS "reportS3Key" varchar(255),
  ADD COLUMN IF NOT EXISTS "reportGeneratedAt" timestamp;
