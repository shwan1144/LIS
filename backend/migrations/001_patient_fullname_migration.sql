-- Migration: Replace firstName/lastName with fullName, add patientNumber
-- Run this BEFORE deploying the new code if you have existing patient data.
-- For fresh installs, you can skip this file.
-- Note: TypeORM uses quoted identifiers; column names may be camelCase ("firstName") or snake_case (first_name) depending on your setup.
-- If this fails, check your actual column names with: \d patients

-- 1. Add new columns (nullable initially)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS "fullName" VARCHAR(256);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS "patientNumber" VARCHAR(24);

-- 2. Migrate existing data: fullName = firstName + ' ' + lastName
-- (Try "firstName"/"lastName" for TypeORM default, or first_name/last_name for snake_case)
UPDATE patients SET "fullName" = TRIM(COALESCE("firstName", '') || ' ' || COALESCE("lastName", ''))
WHERE "fullName" IS NULL AND ("firstName" IS NOT NULL OR "lastName" IS NOT NULL);

-- 3. Handle snake_case column names if above didn't match (run only if needed):
-- UPDATE patients SET fullName = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) WHERE ...

-- 4. Set default for rows with no name
UPDATE patients SET "fullName" = 'Unknown' WHERE "fullName" IS NULL OR TRIM("fullName") = '';

-- 5. Generate patientNumber (P-000001, P-000002, ...) for existing rows
WITH numbered AS (
  SELECT id, 'P-' || LPAD(ROW_NUMBER() OVER (ORDER BY "createdAt")::text, 6, '0') AS pnum
  FROM patients WHERE "patientNumber" IS NULL
)
UPDATE patients p SET "patientNumber" = n.pnum FROM numbered n WHERE p.id = n.id;

-- 6. Make columns NOT NULL
ALTER TABLE patients ALTER COLUMN "fullName" SET NOT NULL;
ALTER TABLE patients ALTER COLUMN "patientNumber" SET NOT NULL;

-- 7. Add unique constraint on patientNumber
ALTER TABLE patients ADD CONSTRAINT "UQ_patients_patientNumber" UNIQUE ("patientNumber");

-- 8. Drop old columns
ALTER TABLE patients DROP COLUMN IF EXISTS "firstName";
ALTER TABLE patients DROP COLUMN IF EXISTS "lastName";
