require('dotenv').config();
const argon2 = require('argon2');
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
  const email = (process.env.PLATFORM_SEED_EMAIL || 'superadmin@lis.local').trim().toLowerCase();
  const password = (process.env.PLATFORM_SEED_PASSWORD || 'password').trim();

  if (!email || !password) {
    throw new Error('Both PLATFORM_SEED_EMAIL and PLATFORM_SEED_PASSWORD must be set (or use defaults).');
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });

  const client = new Client(buildPgConfig());
  await client.connect();

  try {
    await client.query('BEGIN');
    const result = await client.query(
      `
        INSERT INTO "platform_users" ("email", "passwordHash", "role", "isActive")
        VALUES ($1, $2, 'SUPER_ADMIN', true)
        ON CONFLICT ("email")
        DO UPDATE
          SET "passwordHash" = EXCLUDED."passwordHash",
              "role" = 'SUPER_ADMIN',
              "isActive" = true,
              "updatedAt" = CURRENT_TIMESTAMP
        RETURNING "id", "email", "role", "isActive"
      `,
      [email, passwordHash],
    );

    await client.query('COMMIT');
    console.log('Platform admin reset complete.');
    console.table(result.rows);
    console.log(`Login with: ${email} / ${password}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  const message = error && error.stack ? error.stack : String(error);
  console.error(`Failed to reset platform admin: ${message}`);
  process.exit(1);
});
