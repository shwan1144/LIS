const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS "schema_migrations" (
      "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "filename" varchar(255) NOT NULL UNIQUE,
      "checksum" varchar(64) NOT NULL,
      "appliedAt" timestamp NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    INSERT INTO "schema_migrations" ("filename", "checksum")
    VALUES (
      '001_patient_fullname_migration.sql',
      '79b1c7e6cbb29a6b9a1d8505ebed9fa9da7e03a467aa8a531978e966506c15c8'
    )
    ON CONFLICT ("filename") DO NOTHING
  `);

  console.log('Done: migration 001 marked as applied');
  await client.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
