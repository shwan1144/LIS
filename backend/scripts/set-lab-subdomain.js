const { Client } = require("pg");

async function main() {
  const LAB_CODE = "LAB01";
  const SUBDOMAIN = "heroic-rejoicing-production-4c01";

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const result = await client.query(
    'UPDATE "labs" SET "subdomain" = $1 WHERE "code" = $2',
    [SUBDOMAIN, LAB_CODE]
  );

  const check = await client.query(
    'SELECT "id","code","name","subdomain" FROM "labs" ORDER BY "code"'
  );

  console.log(`Updated rows: ${result.rowCount}`);
  console.table(check.rows);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
