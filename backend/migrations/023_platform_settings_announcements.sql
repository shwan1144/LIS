CREATE TABLE IF NOT EXISTS "platform_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" varchar(80) NOT NULL UNIQUE,
  "valueText" varchar(255),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
