ALTER TABLE "labs"
  ADD COLUMN IF NOT EXISTS "enableOnlineResults" boolean NOT NULL DEFAULT true;

ALTER TABLE "labs"
  ADD COLUMN IF NOT EXISTS "reportBannerDataUrl" text;

ALTER TABLE "labs"
  ADD COLUMN IF NOT EXISTS "reportFooterDataUrl" text;

ALTER TABLE "labs"
  ADD COLUMN IF NOT EXISTS "reportLogoDataUrl" text;

ALTER TABLE "labs"
  ADD COLUMN IF NOT EXISTS "reportWatermarkDataUrl" text;

ALTER TABLE "labs"
  ADD COLUMN IF NOT EXISTS "onlineResultWatermarkDataUrl" text;

ALTER TABLE "labs"
  ADD COLUMN IF NOT EXISTS "onlineResultWatermarkText" varchar(120);

ALTER TABLE "labs"
  ADD COLUMN IF NOT EXISTS "uiTestGroups" jsonb;

UPDATE "labs"
SET "enableOnlineResults" = true
WHERE "enableOnlineResults" IS NULL;
