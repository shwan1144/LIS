-- Add platform sensitive read audit action
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_logs_action_enum') THEN
    ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'PLATFORM_SENSITIVE_READ';
  END IF;
END $$;

