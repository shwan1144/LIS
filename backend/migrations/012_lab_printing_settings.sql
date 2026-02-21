ALTER TABLE "labs"
  ADD COLUMN IF NOT EXISTS "printMethod" varchar(16) NOT NULL DEFAULT 'browser';

ALTER TABLE "labs"
  ADD COLUMN IF NOT EXISTS "receiptPrinterName" varchar(128);

ALTER TABLE "labs"
  ADD COLUMN IF NOT EXISTS "labelsPrinterName" varchar(128);

ALTER TABLE "labs"
  ADD COLUMN IF NOT EXISTS "reportPrinterName" varchar(128);

UPDATE "labs"
SET "printMethod" = 'browser'
WHERE "printMethod" IS NULL;

