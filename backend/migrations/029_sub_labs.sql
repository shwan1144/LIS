CREATE TABLE IF NOT EXISTS "sub_labs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "labId" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_sub_labs_labId_labs'
  ) THEN
    ALTER TABLE "sub_labs"
      ADD CONSTRAINT "FK_sub_labs_labId_labs"
      FOREIGN KEY ("labId") REFERENCES "labs"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_sub_labs_lab_name"
  ON "sub_labs" ("labId", "name");

CREATE TABLE IF NOT EXISTS "sub_lab_test_prices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "subLabId" uuid NOT NULL,
  "testId" uuid NOT NULL,
  "price" numeric(10, 2) NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_sub_lab_test_prices_subLabId_sub_labs'
  ) THEN
    ALTER TABLE "sub_lab_test_prices"
      ADD CONSTRAINT "FK_sub_lab_test_prices_subLabId_sub_labs"
      FOREIGN KEY ("subLabId") REFERENCES "sub_labs"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_sub_lab_test_prices_testId_tests'
  ) THEN
    ALTER TABLE "sub_lab_test_prices"
      ADD CONSTRAINT "FK_sub_lab_test_prices_testId_tests"
      FOREIGN KEY ("testId") REFERENCES "tests"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sub_lab_test_prices_sub_lab_test"
  ON "sub_lab_test_prices" ("subLabId", "testId");

CREATE INDEX IF NOT EXISTS "IDX_sub_lab_test_prices_sub_lab_active"
  ON "sub_lab_test_prices" ("subLabId", "isActive");

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "subLabId" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_users_subLabId_sub_labs'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_subLabId_sub_labs"
      FOREIGN KEY ("subLabId") REFERENCES "sub_labs"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_active_sub_lab"
  ON "users" ("subLabId")
  WHERE "subLabId" IS NOT NULL AND "isActive" = true;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "sourceSubLabId" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_orders_sourceSubLabId_sub_labs'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "FK_orders_sourceSubLabId_sub_labs"
      FOREIGN KEY ("sourceSubLabId") REFERENCES "sub_labs"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_orders_source_sub_lab"
  ON "orders" ("sourceSubLabId");
