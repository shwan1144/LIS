require('dotenv').config();
const { Client } = require('pg');

function buildConfig() {
  if (process.env.DATABASE_URL) {
    const cfg = { connectionString: process.env.DATABASE_URL };
    if (process.env.DB_SSL === 'true') {
      cfg.ssl = { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
    }
    return cfg;
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'lis',
    ssl:
      process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : undefined,
  };
}

(async () => {
  const client = new Client(buildConfig());
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      filename varchar(255) NOT NULL UNIQUE,
      checksum varchar(64) NOT NULL,
      appliedAt timestamp NOT NULL DEFAULT now()
    )
  `);

  await client.query(
    `INSERT INTO schema_migrations(filename, checksum)
     VALUES ($1, $2)
     ON CONFLICT(filename) DO NOTHING`,
    ['001_patient_fullname_migration.sql', '79b1c7e6cbb29a6b9a1d8505ebed9fa9da7e03a467aa8a531978e966506c15c8'],
  );

  console.log('Marked 001 as applied');
  await client.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
