require('dotenv').config();
const { Client } = require('pg');

function buildPgConfig() {
  if (process.env.DATABASE_URL) {
    const config = {
      connectionString: process.env.DATABASE_URL,
    };
    if (process.env.DB_SSL === 'true') {
      config.ssl = {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      };
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
    console.log('Applying deliveryMethods hotfix...');
    await client.query(
      'ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryMethods" text',
    );

    const verify = await client.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'orders'
          AND column_name = 'deliveryMethods'
      `,
    );

    if (verify.rowCount !== 1) {
      throw new Error(
        'Hotfix verification failed: orders.deliveryMethods column not found after ALTER.',
      );
    }

    console.log('Hotfix complete: orders.deliveryMethods is present.');
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  const message = error && error.stack ? error.stack : String(error);
  console.error(`Hotfix failed: ${message}`);
  process.exit(1);
});
