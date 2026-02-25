require('dotenv').config();
const { Client } = require('pg');

function buildPgConfig() {
  if (process.env.DATABASE_URL) {
    const config = { connectionString: process.env.DATABASE_URL };
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

const SQL = `
DO $$
BEGIN
  IF to_regclass('public.lab_counters') IS NULL THEN
    RAISE EXCEPTION 'lab_counters table does not exist. Run SQL migrations first.';
  END IF;
END $$;

DELETE FROM "lab_counters"
WHERE "counterType" = 'ORDER_NUMBER';

WITH daily_max AS (
  SELECT
    o."labId" AS "labId",
    to_date(substr(o."orderNumber", 1, 6), 'YYMMDD') AS "dateKey",
    MAX(CAST(substr(o."orderNumber", 7) AS bigint)) AS "maxSeq"
  FROM "orders" o
  WHERE o."orderNumber" ~ '^[0-9]{6}[0-9]+$'
  GROUP BY o."labId", to_date(substr(o."orderNumber", 1, 6), 'YYMMDD')
)
INSERT INTO "lab_counters"
  ("labId", "counterType", "scopeKey", "dateKey", "shiftId", "shiftScopeKey", "value")
SELECT
  d."labId",
  'ORDER_NUMBER',
  'ORDER',
  d."dateKey",
  NULL,
  '',
  d."maxSeq"
FROM daily_max d
ON CONFLICT ("labId", "counterType", "scopeKey", "dateKey", "shiftScopeKey")
DO UPDATE
SET
  "value" = GREATEST("lab_counters"."value", EXCLUDED."value"),
  "shiftId" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;
`;

async function run() {
  const client = new Client(buildPgConfig());
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(SQL);

    const summary = await client.query(`
      SELECT
        COUNT(*)::int AS "rows",
        COALESCE(MAX("dateKey"), CURRENT_DATE) AS "latestDate"
      FROM "lab_counters"
      WHERE "counterType" = 'ORDER_NUMBER'
    `);

    await client.query('COMMIT');
    const row = summary.rows[0] || { rows: 0, latestDate: null };
    console.log(
      `Order-number counters rebuilt successfully. rows=${row.rows}, latestDate=${row.latestDate}`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error && error.stack ? error.stack : String(error);
    console.error(`Failed to rebuild order-number counters: ${message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
