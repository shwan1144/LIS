DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'refresh_tokens_actortype_enum'
      AND e.enumlabel = 'LAB_IMPERSONATION'
  ) THEN
    ALTER TYPE "refresh_tokens_actortype_enum" ADD VALUE 'LAB_IMPERSONATION';
  END IF;
END $$;
