-- Fix: Populate patientNumber for existing rows so TypeORM synchronize can succeed.
-- Error: column "patientNumber" of relation "patients" contains null values
--
-- Run: psql -U postgres -d lis -f migrations/fix-patient-number-nulls.sql
-- (Adjust -U, -d for your DB credentials)
--
-- If you get "column does not exist", try snake_case: patient_number, created_at

-- 1. Populate patientNumber for rows where it is NULL (camelCase - TypeORM default)
WITH numbered AS (
  SELECT id, 'P-' || LPAD(ROW_NUMBER() OVER (ORDER BY "createdAt")::text, 6, '0') AS pnum
  FROM patients WHERE "patientNumber" IS NULL
)
UPDATE patients p SET "patientNumber" = n.pnum FROM numbered n WHERE p.id = n.id;

-- 2. Set NOT NULL constraint
ALTER TABLE patients ALTER COLUMN "patientNumber" SET NOT NULL;
