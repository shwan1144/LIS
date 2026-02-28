require('dotenv').config();
const { Client } = require('pg');

function buildPgConfig() {
  if (process.env.DATABASE_URL) {
    const config = { connectionString: process.env.DATABASE_URL };
    if (process.env.DB_SSL === 'true') {
      config.ssl = { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
    } else if (process.env.DATABASE_URL.includes('rlwy.net')) {
      config.ssl = { rejectUnauthorized: false };
    }
    return config;
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

async function run() {
  const client = new Client(buildPgConfig());
  await client.connect();
  try {
    const result = await client.query(`
      SELECT "labId", "orderNumber", COUNT(*)::int AS "count"
      FROM "orders"
      WHERE "orderNumber" IS NOT NULL
      GROUP BY "labId", "orderNumber"
      HAVING COUNT(*) > 1
      ORDER BY "labId", "orderNumber"
    `);

    console.log(`duplicate_rows=${result.rowCount}`);
    if (result.rowCount > 0) {
      console.table(result.rows);
      process.exitCode = 2;
    }
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  const message = error && error.stack ? error.stack : String(error);
  console.error(`Failed to check duplicates: ${message}`);
  process.exit(1);
});
