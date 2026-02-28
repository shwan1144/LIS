-- Migration: Add expectedCompletionMinutes to tests table
-- Date: 2026-02-16
-- Description: Adds expected completion time (in minutes) for tracking test progress

ALTER TABLE tests
ADD COLUMN IF NOT EXISTS "expectedCompletionMinutes" INTEGER NULL;

COMMENT ON COLUMN tests."expectedCompletionMinutes" IS 'Expected completion time in minutes (from order registration). Used for progress tracking.';
