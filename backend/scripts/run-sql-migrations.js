require('dotenv').config();
const { createHash } = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { Client } = require('pg');

function buildPgConfig() {
  if (process.env.DATABASE_URL) {
    const config = {
      connectionString: process.env.DATABASE_URL,
    };
    if (process.env.DB_SSL === 'true') {
      config.ssl = { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
    }
    return config;
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'lis',
    ssl: process.env.DB_SSL === 'true'
      ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : undefined,
  };
}

async function loadMigrationFiles(migrationsDir) {
  const files = await fs.readdir(migrationsDir);
  const sqlFiles = files
    .filter((file) => file.toLowerCase().endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));

  const migrations = [];
  for (const filename of sqlFiles) {
    const fullPath = path.join(migrationsDir, filename);
    const sql = await fs.readFile(fullPath, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    migrations.push({ filename, fullPath, sql, checksum });
  }
  return migrations;
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "schema_migrations" (
      "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "filename" varchar(255) NOT NULL UNIQUE,
      "checksum" varchar(64) NOT NULL,
      "appliedAt" timestamp NOT NULL DEFAULT now()
    )
  `);
}

async function run() {
  const migrationsDir = path.resolve(__dirname, '..', 'migrations');
  const migrations = await loadMigrationFiles(migrationsDir);
  if (migrations.length === 0) {
    console.log('No SQL migrations found.');
    return;
  }

  const client = new Client(buildPgConfig());
  await client.connect();

  try {
    await ensureMigrationsTable(client);

    for (const migration of migrations) {
      const existing = await client.query(
        `SELECT "checksum" FROM "schema_migrations" WHERE "filename" = $1 LIMIT 1`,
        [migration.filename],
      );

      if (existing.rowCount && existing.rows[0].checksum === migration.checksum) {
        console.log(`Skip ${migration.filename} (already applied)`);
        continue;
      }

      if (existing.rowCount) {
        throw new Error(
          `Migration checksum mismatch for ${migration.filename}. ` +
          `Do not edit previously applied migrations.`,
        );
      }

      console.log(`Applying ${migration.filename} ...`);
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO "schema_migrations" ("filename", "checksum") VALUES ($1, $2)`,
        [migration.filename, migration.checksum],
      );
      console.log(`Applied ${migration.filename}`);
    }

    console.log('SQL migrations completed.');
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  const message = error && error.stack ? error.stack : String(error);
  console.error(`Migration runner failed: ${message}`);
  process.exit(1);
});
