DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'marketing_channel_enum') THEN
    CREATE TYPE "marketing_channel_enum" AS ENUM ('WHATSAPP', 'VIBER', 'SMS');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'marketing_message_batch_status_enum') THEN
    CREATE TYPE "marketing_message_batch_status_enum" AS ENUM (
      'QUEUED',
      'RUNNING',
      'COMPLETED',
      'COMPLETED_WITH_ERRORS',
      'FAILED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'marketing_message_recipient_status_enum') THEN
    CREATE TYPE "marketing_message_recipient_status_enum" AS ENUM (
      'PENDING',
      'SENT',
      'FAILED',
      'SKIPPED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "lab_messaging_channel_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "labId" uuid NOT NULL,
  "channel" "marketing_channel_enum" NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "webhookUrl" varchar(512),
  "authToken" varchar(512),
  "senderLabel" varchar(120),
  "timeoutMs" integer NOT NULL DEFAULT 10000,
  "maxRetries" integer NOT NULL DEFAULT 2,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_lab_messaging_channel_configs_lab_channel" UNIQUE ("labId", "channel"),
  CONSTRAINT "FK_lab_messaging_channel_configs_lab" FOREIGN KEY ("labId")
    REFERENCES "labs"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "lab_marketing_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "labId" uuid NOT NULL,
  "channel" "marketing_channel_enum" NOT NULL,
  "templateText" text NOT NULL DEFAULT '',
  "updatedBy" uuid,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_lab_marketing_templates_lab_channel" UNIQUE ("labId", "channel"),
  CONSTRAINT "FK_lab_marketing_templates_lab" FOREIGN KEY ("labId")
    REFERENCES "labs"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_lab_marketing_templates_updatedBy" FOREIGN KEY ("updatedBy")
    REFERENCES "platform_users"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "marketing_message_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "labId" uuid NOT NULL,
  "createdBy" uuid,
  "status" "marketing_message_batch_status_enum" NOT NULL DEFAULT 'QUEUED',
  "channels" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "scope" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "excludedPhones" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "requestedRecipientsCount" integer NOT NULL DEFAULT 0,
  "sentCount" integer NOT NULL DEFAULT 0,
  "failedCount" integer NOT NULL DEFAULT 0,
  "skippedCount" integer NOT NULL DEFAULT 0,
  "startedAt" timestamp,
  "completedAt" timestamp,
  "errorMessage" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "FK_marketing_message_batches_lab" FOREIGN KEY ("labId")
    REFERENCES "labs"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_marketing_message_batches_createdBy" FOREIGN KEY ("createdBy")
    REFERENCES "platform_users"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "marketing_message_recipients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "batchId" uuid NOT NULL,
  "labId" uuid NOT NULL,
  "channel" "marketing_channel_enum" NOT NULL,
  "status" "marketing_message_recipient_status_enum" NOT NULL DEFAULT 'PENDING',
  "orderId" uuid,
  "patientId" uuid,
  "recipientName" varchar(255),
  "recipientPhoneRaw" varchar(64),
  "recipientPhoneNormalized" varchar(32) NOT NULL,
  "messageText" text NOT NULL,
  "attemptCount" integer NOT NULL DEFAULT 0,
  "lastAttemptAt" timestamp,
  "sentAt" timestamp,
  "errorMessage" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "FK_marketing_message_recipients_batch" FOREIGN KEY ("batchId")
    REFERENCES "marketing_message_batches"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_marketing_message_recipients_lab" FOREIGN KEY ("labId")
    REFERENCES "labs"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_marketing_message_recipients_order" FOREIGN KEY ("orderId")
    REFERENCES "orders"("id") ON DELETE SET NULL,
  CONSTRAINT "FK_marketing_message_recipients_patient" FOREIGN KEY ("patientId")
    REFERENCES "patients"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "IDX_marketing_message_batches_lab_createdAt"
  ON "marketing_message_batches" ("labId", "createdAt");
CREATE INDEX IF NOT EXISTS "IDX_marketing_message_batches_status_createdAt"
  ON "marketing_message_batches" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "IDX_marketing_message_recipients_batch_status"
  ON "marketing_message_recipients" ("batchId", "status");
CREATE INDEX IF NOT EXISTS "IDX_marketing_message_recipients_batch_channel"
  ON "marketing_message_recipients" ("batchId", "channel");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_logs_action_enum') THEN
    ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'PLATFORM_BULK_MESSAGE_CONFIG_UPDATE';
    ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'PLATFORM_BULK_MESSAGE_SEND';
    ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'PLATFORM_BULK_MESSAGE_JOB_UPDATE';
  END IF;
END $$;
