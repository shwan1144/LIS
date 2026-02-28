CREATE TABLE IF NOT EXISTS "admin_lab_portal_tokens" (
  "id" uuid PRIMARY KEY,
  "platformUserId" uuid NOT NULL,
  "labId" uuid NOT NULL,
  "tokenHash" varchar(255) NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "usedAt" timestamptz NULL,
  "createdIp" varchar(45) NULL,
  "createdUserAgent" varchar(500) NULL,
  "usedIp" varchar(45) NULL,
  "usedUserAgent" varchar(500) NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FK_admin_lab_portal_tokens_platform_user"
    FOREIGN KEY ("platformUserId") REFERENCES "platform_users"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_admin_lab_portal_tokens_lab"
    FOREIGN KEY ("labId") REFERENCES "labs"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_admin_lab_portal_tokens_platform_created"
  ON "admin_lab_portal_tokens" ("platformUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "IDX_admin_lab_portal_tokens_lab_created"
  ON "admin_lab_portal_tokens" ("labId", "createdAt");
CREATE INDEX IF NOT EXISTS "IDX_admin_lab_portal_tokens_expires"
  ON "admin_lab_portal_tokens" ("expiresAt");
CREATE INDEX IF NOT EXISTS "IDX_admin_lab_portal_tokens_used"
  ON "admin_lab_portal_tokens" ("usedAt");

