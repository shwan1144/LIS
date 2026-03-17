ALTER TABLE IF EXISTS "order_tests"
  ADD COLUMN IF NOT EXISTS "resultDocumentStorageKey" text,
  ADD COLUMN IF NOT EXISTS "resultDocumentFileName" varchar(255),
  ADD COLUMN IF NOT EXISTS "resultDocumentMimeType" varchar(100),
  ADD COLUMN IF NOT EXISTS "resultDocumentSizeBytes" integer,
  ADD COLUMN IF NOT EXISTS "resultDocumentUploadedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "resultDocumentUploadedBy" uuid;
