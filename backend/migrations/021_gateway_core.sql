CREATE TABLE IF NOT EXISTS "gateway_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "labId" uuid NOT NULL,
  "name" varchar(120) NOT NULL,
  "fingerprintHash" varchar(128) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'ACTIVE',
  "version" varchar(32),
  "lastSeenAt" timestamp,
  "lastHeartbeat" jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "FK_gateway_devices_labId_labs"
    FOREIGN KEY ("labId")
    REFERENCES "labs"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_gateway_devices_lab"
  ON "gateway_devices" ("labId");
CREATE INDEX IF NOT EXISTS "IDX_gateway_devices_fingerprint"
  ON "gateway_devices" ("fingerprintHash");

CREATE TABLE IF NOT EXISTS "gateway_activation_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "labId" uuid NOT NULL,
  "codeHash" varchar(128) NOT NULL UNIQUE,
  "expiresAt" timestamp NOT NULL,
  "usedAt" timestamp,
  "revokedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "FK_gateway_activation_codes_labId_labs"
    FOREIGN KEY ("labId")
    REFERENCES "labs"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_gateway_activation_codes_lab"
  ON "gateway_activation_codes" ("labId");
CREATE INDEX IF NOT EXISTS "IDX_gateway_activation_codes_expires"
  ON "gateway_activation_codes" ("expiresAt");

CREATE TABLE IF NOT EXISTS "gateway_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "gatewayId" uuid NOT NULL,
  "refreshHash" varchar(255) NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "revokedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "FK_gateway_tokens_gatewayId_gateway_devices"
    FOREIGN KEY ("gatewayId")
    REFERENCES "gateway_devices"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_gateway_tokens_gateway"
  ON "gateway_tokens" ("gatewayId");
CREATE INDEX IF NOT EXISTS "IDX_gateway_tokens_expires"
  ON "gateway_tokens" ("expiresAt");

CREATE TABLE IF NOT EXISTS "gateway_message_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "gatewayId" uuid NOT NULL,
  "localMessageId" varchar(128) NOT NULL,
  "instrumentId" uuid NOT NULL,
  "serverMessageId" uuid,
  "receivedAt" timestamp NOT NULL,
  CONSTRAINT "FK_gateway_message_receipts_gatewayId_gateway_devices"
    FOREIGN KEY ("gatewayId")
    REFERENCES "gateway_devices"("id")
    ON DELETE CASCADE,
  CONSTRAINT "FK_gateway_message_receipts_instrumentId_instruments"
    FOREIGN KEY ("instrumentId")
    REFERENCES "instruments"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_gateway_message_receipts_gateway"
  ON "gateway_message_receipts" ("gatewayId");
CREATE INDEX IF NOT EXISTS "IDX_gateway_message_receipts_instrument"
  ON "gateway_message_receipts" ("instrumentId");
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_gateway_message_receipts_gateway_local"
  ON "gateway_message_receipts" ("gatewayId", "localMessageId");
