const { Client } = require("pg");
(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('UPDATE "labs" SET "subdomain"=$1 WHERE "code"=$2', ['lis-production-a5e1','LAB01']);
  const r = await client.query('SELECT code,subdomain FROM "labs"');
  console.table(r.rows);
  await client.end();
})();
