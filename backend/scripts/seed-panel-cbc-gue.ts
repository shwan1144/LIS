/**
 * Reseed canonical CBC/GUE panel definitions for one lab.
 *
 * Policy:
 * - Future orders only
 * - No historical order backfill
 * - Scope limited to CBC + GUE panel definitions
 *
 * Usage:
 *   npm run seed:panel-cbc-gue
 *   npm run seed:panel-cbc-gue -- --lab-code=LAB01
 *   npm run seed:panel-cbc-gue -- --lab-name="Main Lab"
 */
import { config } from 'dotenv';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { DATABASE_ENTITIES } from '../src/database/entities';
import { Lab } from '../src/entities/lab.entity';
import { Test } from '../src/entities/test.entity';
import { Pricing } from '../src/entities/pricing.entity';
import { TestComponent } from '../src/entities/test-component.entity';
import { TestAntibiotic } from '../src/entities/test-antibiotic.entity';
import { Antibiotic } from '../src/entities/antibiotic.entity';
import { OrderTest } from '../src/entities/order-test.entity';
import { Department } from '../src/entities/department.entity';
import { TestsService } from '../src/tests/tests.service';

config({ path: join(__dirname, '..', '.env') });

function createDataSource(): DataSource {
  if (process.env.DATABASE_URL) {
    return new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: DATABASE_ENTITIES,
      synchronize: false,
    });
  }

  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'lis',
    entities: DATABASE_ENTITIES,
    synchronize: false,
  });
}

function parseArg(name: string): string | undefined {
  const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (!exact) return undefined;
  const value = exact.split('=').slice(1).join('=').trim();
  return value.length ? value : undefined;
}

async function getPanelCounts(dataSource: DataSource, labId: string) {
  const rows = await dataSource.query(
    `
    SELECT
      t.code AS panel_code,
      COUNT(tc."childTestId")::int AS component_count
    FROM tests t
    LEFT JOIN test_components tc
      ON tc."panelTestId" = t.id
    WHERE t."labId" = $1
      AND t.type = 'PANEL'
      AND t.code IN ('CBC', 'GUE')
    GROUP BY t.code
    ORDER BY t.code
    `,
    [labId],
  );

  const map = new Map<string, number>();
  for (const row of rows as Array<{ panel_code: string; component_count: number }>) {
    map.set(String(row.panel_code), Number(row.component_count));
  }

  return {
    CBC: map.get('CBC') ?? 0,
    GUE: map.get('GUE') ?? 0,
  };
}

async function run() {
  const labCode = parseArg('--lab-code') ?? 'LAB01';
  const fallbackLabName = parseArg('--lab-name') ?? 'Main Lab';
  const dataSource = createDataSource();

  try {
    await dataSource.initialize();

    const labRepo = dataSource.getRepository(Lab);
    const lab =
      (await labRepo.findOne({ where: { code: labCode } })) ??
      (await labRepo.findOne({ where: { name: fallbackLabName } }));

    if (!lab) {
      throw new Error(
        `Lab not found (searched code="${labCode}", name="${fallbackLabName}")`,
      );
    }

    const testsService = new TestsService(
      dataSource.getRepository(Test),
      dataSource.getRepository(Pricing),
      dataSource.getRepository(TestComponent),
      dataSource.getRepository(TestAntibiotic),
      dataSource.getRepository(Antibiotic),
      dataSource.getRepository(OrderTest),
      dataSource.getRepository(Department),
    );

    const before = await getPanelCounts(dataSource, lab.id);
    console.log(
      JSON.stringify(
        {
          event: 'panel.seed.baseline',
          labId: lab.id,
          labCode: lab.code,
          labName: lab.name,
          counts: before,
        },
        null,
        2,
      ),
    );

    const cbc = await testsService.seedCBCTests(lab.id);
    const gue = await testsService.seedUrinalysisTests(lab.id);

    const after = await getPanelCounts(dataSource, lab.id);
    console.log(
      JSON.stringify(
        {
          event: 'panel.seed.result',
          labId: lab.id,
          labCode: lab.code,
          labName: lab.name,
          cbcSeedResult: cbc,
          gueSeedResult: gue,
          countsBefore: before,
          countsAfter: after,
          notes: [
            'No historical order child backfill performed.',
            'Only panel definitions (tests + test_components) were reseeded.',
          ],
        },
        null,
        2,
      ),
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    console.error('CBC/GUE reseed failed:', message);
    process.exitCode = 1;
  } finally {
    await dataSource.destroy();
  }
}

void run();
