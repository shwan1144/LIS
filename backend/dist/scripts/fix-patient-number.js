"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const pg_1 = require("pg");
async function run() {
    const client = new pg_1.Client({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_DATABASE || 'lis',
    });
    try {
        await client.connect();
        console.log('Connected to database.');
        const cols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'patients' AND table_schema = 'public'
    `);
        const colSet = new Set(cols.rows.map((r) => r.column_name));
        const patientNumCol = colSet.has('patientNumber') ? '"patientNumber"' : colSet.has('patient_number') ? 'patient_number' : null;
        const fullNameCol = colSet.has('fullName') ? '"fullName"' : colSet.has('full_name') ? 'full_name' : null;
        const createdAtCol = colSet.has('createdAt') ? '"createdAt"' : colSet.has('created_at') ? 'created_at' : '"createdAt"';
        const firstNameCol = colSet.has('firstName') ? '"firstName"' : colSet.has('first_name') ? 'first_name' : null;
        const lastNameCol = colSet.has('lastName') ? '"lastName"' : colSet.has('last_name') ? 'last_name' : null;
        if (!patientNumCol) {
            await client.query(`ALTER TABLE patients ADD COLUMN "patientNumber" VARCHAR(24)`);
            console.log('Added patientNumber column.');
        }
        if (!fullNameCol) {
            await client.query(`ALTER TABLE patients ADD COLUMN "fullName" VARCHAR(256)`);
            console.log('Added fullName column.');
        }
        const pNumCol = patientNumCol || '"patientNumber"';
        const fNameCol = fullNameCol || '"fullName"';
        if (firstNameCol && lastNameCol) {
            await client.query(`
        UPDATE patients SET ${fNameCol} = TRIM(COALESCE(${firstNameCol}, '') || ' ' || COALESCE(${lastNameCol}, ''))
        WHERE (${fNameCol} IS NULL OR TRIM(${fNameCol}) = '') AND (${firstNameCol} IS NOT NULL OR ${lastNameCol} IS NOT NULL)
      `);
        }
        await client.query(`
      UPDATE patients SET ${fNameCol} = 'Unknown' WHERE ${fNameCol} IS NULL OR TRIM(${fNameCol}) = ''
    `);
        const updateResult = await client.query(`
      WITH numbered AS (
        SELECT id, 'P-' || LPAD(ROW_NUMBER() OVER (ORDER BY ${createdAtCol})::text, 6, '0') AS pnum
        FROM patients WHERE ${pNumCol} IS NULL
      )
      UPDATE patients p SET ${pNumCol} = n.pnum FROM numbered n WHERE p.id = n.id
    `);
        console.log(`Updated ${updateResult.rowCount ?? 0} row(s) with patientNumber.`);
        await client.query(`ALTER TABLE patients ALTER COLUMN ${pNumCol} SET NOT NULL`);
        await client.query(`ALTER TABLE patients ALTER COLUMN ${fNameCol} SET NOT NULL`);
        console.log('Set NOT NULL constraints.');
        if (firstNameCol) {
            await client.query(`ALTER TABLE patients DROP COLUMN IF EXISTS ${firstNameCol}`);
        }
        if (lastNameCol) {
            await client.query(`ALTER TABLE patients DROP COLUMN IF EXISTS ${lastNameCol}`);
        }
        if (firstNameCol || lastNameCol) {
            console.log('Dropped firstName/lastName columns.');
        }
        console.log('Done. You can now start the backend with: npm run start');
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Migration failed:', message);
        process.exit(1);
    }
    finally {
        await client.end();
    }
}
run();
//# sourceMappingURL=fix-patient-number.js.map