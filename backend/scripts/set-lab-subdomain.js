const { Client } = require('pg');

async function main() {
  const code = (process.argv[2] || process.env.LAB_CODE || '').trim().toUpperCase();
  const subdomain = (process.argv[3] || process.env.LAB_SUBDOMAIN || '').trim().toLowerCase();

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is missing. Run with Railway: railway run node scripts/set-lab-subdomain.js LAB01 lab01');
    process.exit(1);
  }

  if (!code || !subdomain) {
    console.log('Usage:');
    console.log('  node scripts/set-lab-subdomain.js <LAB_CODE> <subdomain>');
    console.log('Example:');
    console.log('  node scripts/set-lab-subdomain.js LAB01 lab01');
    process.exit(1);
  }

  if (!/^[a-z0-9-]+$/.test(subdomain)) {
    console.error('Invalid subdomain. Use only lowercase letters, numbers, and dashes.');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const update = await client.query(
      'UPDATE "labs" SET "subdomain"=$1 WHERE "code"=$2 RETURNING id, code, name, subdomain',
      [subdomain, code],
    );

    if (update.rowCount === 0) {
      console.error(`No lab found with code "${code}".`);
      const existing = await client.query('SELECT code, name, subdomain FROM "labs" ORDER BY code');
      console.log('Existing labs:');
      console.table(existing.rows);
      process.exit(1);
    }

    console.log('Updated lab:');
    console.table(update.rows);

    const all = await client.query('SELECT code, name, subdomain FROM "labs" ORDER BY code');
    console.log('All labs:');
    console.table(all.rows);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Failed to set lab subdomain:', error.message || error);
  process.exit(1);
});
