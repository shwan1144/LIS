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
    ssl:
      process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : undefined,
  };
}

const SQL = `
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users',
    'orders',
    'samples',
    'order_tests',
    'results',
    'tests',
    'test_components',
    'shifts',
    'departments',
    'instruments',
    'pricing',
    'lab_orders_worklist',
    'instrument_test_mappings',
    'instrument_messages',
    'user_lab_assignments',
    'user_department_assignments',
    'user_shift_assignments',
    'order_test_result_history',
    'unmatched_instrument_results',
    'lab_counters',
    'refresh_tokens',
    'admin_lab_portal_tokens'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO app_lab_user', t);
    END IF;
  END LOOP;

  IF to_regclass('public.patients') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE "patients" TO app_lab_user;
  END IF;

  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    GRANT SELECT, INSERT ON TABLE "audit_logs" TO app_lab_user;
    ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "audit_logs_tenant_isolation" ON "audit_logs";
    CREATE POLICY "audit_logs_tenant_isolation" ON "audit_logs"
      FOR ALL TO app_lab_user
      USING ("labId" = app.current_lab_id())
      WITH CHECK ("labId" = app.current_lab_id());
  END IF;

  IF to_regclass('public.lab_counters') IS NOT NULL THEN
    ALTER TABLE "lab_counters" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "lab_counters" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "lab_counters_tenant_isolation" ON "lab_counters";
    CREATE POLICY "lab_counters_tenant_isolation" ON "lab_counters"
      FOR ALL TO app_lab_user
      USING ("labId" = app.current_lab_id())
      WITH CHECK ("labId" = app.current_lab_id());
  END IF;

  IF to_regclass('public.order_test_result_history') IS NOT NULL
     AND to_regclass('public.order_tests') IS NOT NULL THEN
    ALTER TABLE "order_test_result_history" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "order_test_result_history" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "order_test_result_history_tenant_isolation" ON "order_test_result_history";
    CREATE POLICY "order_test_result_history_tenant_isolation" ON "order_test_result_history"
      FOR ALL TO app_lab_user
      USING (
        EXISTS (
          SELECT 1
          FROM "order_tests" ot
          WHERE ot.id = "order_test_result_history"."orderTestId"
            AND ot."labId" = app.current_lab_id()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM "order_tests" ot
          WHERE ot.id = "order_test_result_history"."orderTestId"
            AND ot."labId" = app.current_lab_id()
        )
      );
  END IF;

  IF to_regclass('public.user_department_assignments') IS NOT NULL
     AND to_regclass('public.departments') IS NOT NULL THEN
    ALTER TABLE "user_department_assignments" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "user_department_assignments" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "user_department_assignments_tenant_isolation" ON "user_department_assignments";
    CREATE POLICY "user_department_assignments_tenant_isolation" ON "user_department_assignments"
      FOR ALL TO app_lab_user
      USING (
        EXISTS (
          SELECT 1
          FROM "departments" d
          WHERE d.id = "user_department_assignments"."departmentId"
            AND d."labId" = app.current_lab_id()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM "departments" d
          WHERE d.id = "user_department_assignments"."departmentId"
            AND d."labId" = app.current_lab_id()
        )
      );
  END IF;

  IF to_regclass('public.user_shift_assignments') IS NOT NULL
     AND to_regclass('public.shifts') IS NOT NULL THEN
    ALTER TABLE "user_shift_assignments" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "user_shift_assignments" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "user_shift_assignments_tenant_isolation" ON "user_shift_assignments";
    CREATE POLICY "user_shift_assignments_tenant_isolation" ON "user_shift_assignments"
      FOR ALL TO app_lab_user
      USING (
        EXISTS (
          SELECT 1
          FROM "shifts" s
          WHERE s.id = "user_shift_assignments"."shiftId"
            AND s."labId" = app.current_lab_id()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM "shifts" s
          WHERE s.id = "user_shift_assignments"."shiftId"
            AND s."labId" = app.current_lab_id()
        )
      );
  END IF;

  IF to_regclass('public.unmatched_instrument_results') IS NOT NULL
     AND to_regclass('public.instruments') IS NOT NULL THEN
    ALTER TABLE "unmatched_instrument_results" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "unmatched_instrument_results" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "unmatched_instrument_results_tenant_isolation" ON "unmatched_instrument_results";
    CREATE POLICY "unmatched_instrument_results_tenant_isolation" ON "unmatched_instrument_results"
      FOR ALL TO app_lab_user
      USING (
        EXISTS (
          SELECT 1
          FROM "instruments" i
          WHERE i.id = "unmatched_instrument_results"."instrumentId"
            AND i."labId" = app.current_lab_id()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM "instruments" i
          WHERE i.id = "unmatched_instrument_results"."instrumentId"
            AND i."labId" = app.current_lab_id()
        )
      );
  END IF;
END $$;

GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_lab_user;
`;

async function run() {
  const client = new Client(buildPgConfig());
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(SQL);
    await client.query('COMMIT');
    console.log('Tenant grants and RLS fixes applied successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error && error.stack ? error.stack : String(error);
    console.error(`Failed to apply tenant grants: ${message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
