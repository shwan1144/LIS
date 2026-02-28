import { Pool } from 'pg';

const runRlsE2E = Boolean(process.env.RLS_E2E_DATABASE_URL);
const describeRls = runRlsE2E ? describe : describe.skip;

describeRls('RLS request context leak-proof', () => {
  const tableName = `rls_context_leak_e2e_${Date.now()}`;
  const lab1Id = '11111111-1111-4111-8111-111111111111';
  const lab2Id = '22222222-2222-4222-8222-222222222222';
  let pool: Pool;
  let canRun = true;
  let skipReason = '';

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.RLS_E2E_DATABASE_URL,
      max: 1,
    });
    const client = await pool.connect();

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
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (!pool) {
      return;
    }
    const client = await pool.connect();
    try {
      await client.query(`DROP TABLE IF EXISTS "${tableName}"`);
    } finally {
      client.release();
      await pool.end();
    }
  });

  async function runScopedRequest(
    labId: string,
    options: { forceFail?: boolean } = {},
  ): Promise<{ preContextLabId: string | null; visiblePayloads: string[] }> {
    const client = await pool.connect();
    let transactionActive = false;

    try {
      await client.query('BEGIN');
      transactionActive = true;

      const preContext = await client.query<{ currentLabId: string | null }>(
        `SELECT current_setting('app.current_lab_id', true) AS "currentLabId"`,
      );
      await client.query(`SELECT set_config('app.current_lab_id', $1, true)`, [labId]);
      await client.query(`SET ROLE app_lab_user`);

      const visibleRows = await client.query<{ payload: string }>(
        `SELECT payload FROM "${tableName}" ORDER BY payload ASC`,
      );

      if (options.forceFail) {
        throw new Error('forced request failure');
      }

      await client.query('COMMIT');
      transactionActive = false;

      return {
        preContextLabId: preContext.rows[0]?.currentLabId ?? null,
        visiblePayloads: visibleRows.rows.map((row) => row.payload),
      };
    } finally {
      try {
        await client.query('RESET ROLE');
      } catch {
        // best-effort reset to mirror production cleanup
      }
      if (transactionActive) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // best-effort rollback before releasing pooled client
        }
      }
      client.release();
    }
  }

  it('does not leak tenant context after a failed request on the same pooled connection', async () => {
    if (!canRun) {
      console.warn(`RLS context leak e2e skipped at runtime: ${skipReason}`);
      return;
    }

    await expect(
      runScopedRequest(lab1Id, { forceFail: true }),
    ).rejects.toThrow('forced request failure');

    const nextRequest = await runScopedRequest(lab2Id);
    expect(nextRequest.preContextLabId).toBeNull();
    expect(nextRequest.visiblePayloads).toEqual(['lab2 row']);
  });
});
