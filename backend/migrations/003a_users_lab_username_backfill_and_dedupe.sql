-- Pre-hardening fix for existing databases:
-- 1) Ensure users.labId exists before 004 migration backfill.
-- 2) Backfill users.labId from defaultLabId / user_lab_assignments when possible.
-- 3) De-duplicate (labId, username) rows so 004 unique index can be created.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'users'
      AND con.conname = 'UQ_users_lab_username'
  ) THEN
    ALTER TABLE "users" DROP CONSTRAINT "UQ_users_lab_username";
  END IF;
END $$;

DROP INDEX IF EXISTS "UQ_users_lab_username";

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "labId" uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'defaultLabId'
  ) THEN
    UPDATE "users"
    SET "labId" = "defaultLabId"
    WHERE "labId" IS NULL
      AND "defaultLabId" IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_lab_assignments'
  ) THEN
    UPDATE "users" u
    SET "labId" = x."labId"
    FROM (
      SELECT DISTINCT ON ("userId")
        "userId",
        "labId"
      FROM "user_lab_assignments"
      WHERE "labId" IS NOT NULL
      ORDER BY "userId", "labId"
    ) x
    WHERE u.id = x."userId"
      AND u."labId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'username'
  ) THEN
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY "labId", "username"
          ORDER BY "createdAt" NULLS LAST, id
        ) AS rn
      FROM "users"
      WHERE "labId" IS NOT NULL
    ),
    dupes AS (
      SELECT id
      FROM ranked
      WHERE rn > 1
    )
    UPDATE "users" u
    SET "username" = LEFT(u."username", 31) || '_' || REPLACE(u.id::text, '-', '')
    FROM dupes d
    WHERE u.id = d.id;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_lab_username"
  ON "users" ("labId", "username")
  WHERE "labId" IS NOT NULL;
