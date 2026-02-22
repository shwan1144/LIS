import { DataSource } from 'typeorm';
import { nextLabCounterValue } from '../src/database/lab-counter.util';

const connectionString = process.env.RLS_E2E_DATABASE_URL || process.env.DATABASE_URL;
const describeIfDb = connectionString ? describe : describe.skip;

describeIfDb('Order number counter concurrency', () => {
  let dataSource: DataSource;
  let labId: string;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: connectionString,
    });
    await dataSource.initialize();

    await dataSource.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await dataSource.query(`
      CREATE TABLE IF NOT EXISTS "lab_counters" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "labId" uuid NOT NULL,
        "counterType" varchar(64) NOT NULL,
        "scopeKey" varchar(128) NOT NULL DEFAULT '__default__',
        "dateKey" date NOT NULL,
        "shiftId" uuid NULL,
        "shiftScopeKey" varchar(36) NOT NULL DEFAULT '',
        "value" bigint NOT NULL DEFAULT 0,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_lab_counters_scope"
      ON "lab_counters" ("labId", "counterType", "scopeKey", "dateKey", "shiftScopeKey")
    `);

    const createdLab = await dataSource.query(
      `
        INSERT INTO "labs" ("code", "name", "timezone", "isActive")
        VALUES ($1, $2, 'UTC', true)
        RETURNING "id"
      `,
      [`LAB${Date.now()}`, `Concurrency Lab ${Date.now()}`],
    );
    labId = createdLab[0].id as string;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      if (labId) {
        await dataSource.query(`DELETE FROM "lab_counters" WHERE "labId" = $1`, [labId]);
        await dataSource.query(`DELETE FROM "labs" WHERE "id" = $1`, [labId]);
      }
      await dataSource.destroy();
    }
  });

  it('produces unique order numbers under parallel load', async () => {
    const date = new Date('2026-02-22T10:00:00.000Z');
    const count = 60;

    const seqValues = await Promise.all(
      Array.from({ length: count }, () =>
        nextLabCounterValue(dataSource.manager, {
          labId,
          counterType: 'ORDER_NUMBER',
          scopeKey: 'ORDER',
          date,
          shiftId: null,
        }),
      ),
    );

    const uniqueSeq = new Set(seqValues);
    expect(uniqueSeq.size).toBe(count);
    expect(Math.min(...seqValues)).toBe(1);
    expect(Math.max(...seqValues)).toBe(count);

    const yy = String(date.getFullYear() % 100).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const prefix = `${yy}${mm}${dd}`;
    const orderNumbers = seqValues.map((seq) => `${prefix}${String(seq).padStart(3, '0')}`);

    expect(new Set(orderNumbers).size).toBe(count);
  });
});
