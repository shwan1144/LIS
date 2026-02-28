-- Add optional age/sex-specific numeric ranges for tests.
-- JSON shape per row:
-- [
--   {
--     "sex": "ANY" | "M" | "F",
--     "minAgeYears": number | null,
--     "maxAgeYears": number | null,
--     "normalMin": number | null,
--     "normalMax": number | null
--   }
-- ]

ALTER TABLE "tests"
  ADD COLUMN IF NOT EXISTS "numericAgeRanges" jsonb;
