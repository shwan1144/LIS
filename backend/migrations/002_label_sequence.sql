-- Label sequence settings (lab) and tube sequence number (samples).
-- Run if your DB does not use TypeORM synchronize (e.g. production).

-- Labs: label sequence by (tube_type | department) and reset by (day | shift)
ALTER TABLE labs
  ADD COLUMN IF NOT EXISTS "labelSequenceBy" varchar(32) DEFAULT 'tube_type',
  ADD COLUMN IF NOT EXISTS "sequenceResetBy" varchar(32) DEFAULT 'day';

-- Samples: tube sequence number (1, 2, 3...) within scope
ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS "sequenceNumber" integer NULL;
