-- Order payment status (required to print/download/send results).
-- Run if your DB does not use TypeORM synchronize (e.g. production).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS "paymentStatus" varchar(32) DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS "paidAmount" decimal(10,2) NULL;
