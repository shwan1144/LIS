-- Add panelSortOrder to order_tests for stable panel child ordering
ALTER TABLE order_tests ADD COLUMN IF NOT EXISTS "panelSortOrder" integer NULL;

-- Index for fast ordering of panel children
CREATE INDEX IF NOT EXISTS idx_order_tests_parent_sort
  ON order_tests ("parentOrderTestId", "panelSortOrder")
  WHERE "parentOrderTestId" IS NOT NULL;
