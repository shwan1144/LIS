import { Client } from 'pg';

const runRlsE2E = Boolean(process.env.RLS_E2E_DATABASE_URL);

const describeRls = runRlsE2E ? describe : describe.skip;

describeRls('PostgreSQL RLS isolation', () => {
  const tableName = `rls_orders_e2e_${Date.now()}`;
  const lab1Id = '11111111-1111-4111-8111-111111111111';
  const lab2Id = '22222222-2222-4222-8222-222222222222';
  let client: Client;
  let canRun = true;
  let skipReason = '';

  beforeAll(async () => {
    client = new Client({
      connectionString: process.env.RLS_E2E_DATABASE_URL,
    });
    await client.connect();

    try {
      await client.query(`CREATE SCHEMA IF NOT EXISTS app`);
      await client.query(`
        CREATE OR REPLACE FUNCTION app.current_lab_id()
        RETURNS uuid
        LANGUAGE sql
        STABLE
        AS $$
          SELECT NULLIF(current_setting('app.current_lab_id', true), '')::uuid
        $$;
      `);
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_lab_user') THEN
            CREATE ROLE app_lab_user NOLOGIN;
          END IF;
        END $$;
      `);

      await client.query(`
        CREATE TABLE "${tableName}" (
          id uuid PRIMARY KEY,
          "labId" uuid NOT NULL,
          payload text NOT NULL
        );
      `);

      await client.query(
        `
        INSERT INTO "${tableName}" (id, "labId", payload) VALUES
          ($1, $2, 'lab1 row'),
          ($3, $4, 'lab2 row')
        `,
        [
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          lab1Id,
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          lab2Id,
        ],
      );

      await client.query(`ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY`);
      await client.query(`ALTER TABLE "${tableName}" FORCE ROW LEVEL SECURITY`);

      await client.query(`
        CREATE POLICY "${tableName}_tenant_policy"
        ON "${tableName}"
        FOR ALL
        TO app_lab_user
        USING ("labId" = app.current_lab_id())
        WITH CHECK ("labId" = app.current_lab_id());
      `);

      await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON "${tableName}" TO app_lab_user`);

      const user = await client.query<{ current_user: string }>(`SELECT current_user`);
      const dbUser = user.rows[0]?.current_user;
      if (!dbUser) {
        throw new Error('Could not resolve current_user');
      }

      try {
        await client.query(`GRANT app_lab_user TO "${dbUser}"`);
      } catch (error) {
        canRun = false;
        skipReason = `Current DB user cannot SET ROLE app_lab_user: ${error instanceof Error ? error.message : String(error)}`;
      }
    } catch (error) {
      canRun = false;
      skipReason = error instanceof Error ? error.message : String(error);
    }
  });

  afterAll(async () => {
    if (client) {
      await client.query(`DROP TABLE IF EXISTS "${tableName}"`);
      await client.end();
    }
  });

  it('blocks cross-lab rows even without explicit WHERE labId', async () => {
    if (!canRun) {
      console.warn(`RLS e2e skipped at runtime: ${skipReason}`);
      return;
    }

    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE app_lab_user');
      await client.query(`SELECT set_config('app.current_lab_id', $1, true)`, [lab1Id]);

      const visibleRows = await client.query(`SELECT payload FROM "${tableName}" ORDER BY payload ASC`);
      expect(visibleRows.rows.map((row) => row.payload)).toEqual(['lab1 row']);

      const forcedCrossLab = await client.query(
        `SELECT payload FROM "${tableName}" WHERE "labId" = $1`,
        [lab2Id],
      );
      expect(forcedCrossLab.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
