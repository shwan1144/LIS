ALTER TABLE IF EXISTS "tests"
  ADD COLUMN IF NOT EXISTS "cultureConfig" jsonb;

ALTER TABLE IF EXISTS "order_tests"
  ADD COLUMN IF NOT EXISTS "cultureResult" jsonb;

CREATE TABLE IF NOT EXISTS "antibiotics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "labId" uuid NOT NULL,
  "code" varchar(64) NOT NULL,
  "name" varchar(255) NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "FK_antibiotics_labId_labs"
    FOREIGN KEY ("labId")
    REFERENCES "labs"("id")
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_antibiotics_lab_code"
  ON "antibiotics" ("labId", "code");

CREATE INDEX IF NOT EXISTS "IDX_antibiotics_lab_sort"
  ON "antibiotics" ("labId", "sortOrder", "code");

CREATE TABLE IF NOT EXISTS "test_antibiotics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "testId" uuid NOT NULL,
  "antibioticId" uuid NOT NULL,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "isDefault" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "FK_test_antibiotics_testId_tests"
    FOREIGN KEY ("testId")
    REFERENCES "tests"("id")
    ON DELETE CASCADE,
  CONSTRAINT "FK_test_antibiotics_antibioticId_antibiotics"
    FOREIGN KEY ("antibioticId")
    REFERENCES "antibiotics"("id")
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_test_antibiotics_test_antibiotic"
  ON "test_antibiotics" ("testId", "antibioticId");

CREATE INDEX IF NOT EXISTS "IDX_test_antibiotics_test_sort"
  ON "test_antibiotics" ("testId", "sortOrder");
