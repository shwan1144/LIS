-- Add platform lab management audit actions to existing enum
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_logs_action_enum') THEN
    ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'PLATFORM_LAB_CREATE';
    ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'PLATFORM_LAB_UPDATE';
    ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'PLATFORM_LAB_STATUS_CHANGE';
  END IF;
END $$;

