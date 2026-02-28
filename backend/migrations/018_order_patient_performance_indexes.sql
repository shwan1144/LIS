-- Performance indexes for order creation/history and patient listing/search flows.

-- Orders history/listing filters and ordering.
CREATE INDEX IF NOT EXISTS "IDX_orders_lab_registeredAt"
  ON "orders" ("labId", "registeredAt" DESC);

CREATE INDEX IF NOT EXISTS "IDX_orders_lab_status_registeredAt"
  ON "orders" ("labId", "status", "registeredAt" DESC);

CREATE INDEX IF NOT EXISTS "IDX_orders_lab_patient_registeredAt"
  ON "orders" ("labId", "patientId", "registeredAt" DESC);

-- Joins used by order progress enrichment and detail loading.
CREATE INDEX IF NOT EXISTS "IDX_samples_orderId"
  ON "samples" ("orderId");

CREATE INDEX IF NOT EXISTS "IDX_order_tests_sampleId"
  ON "order_tests" ("sampleId");

CREATE INDEX IF NOT EXISTS "IDX_order_tests_sampleId_status"
  ON "order_tests" ("sampleId", "status");

-- Patients ordering and lookup helpers.
CREATE INDEX IF NOT EXISTS "IDX_patients_updatedAt"
  ON "patients" ("updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "IDX_patients_phone"
  ON "patients" ("phone")
  WHERE "phone" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "IDX_patients_externalId"
  ON "patients" ("externalId")
  WHERE "externalId" IS NOT NULL;
