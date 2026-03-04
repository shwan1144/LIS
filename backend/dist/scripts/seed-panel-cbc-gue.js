"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const path_1 = require("path");
const typeorm_1 = require("typeorm");
const entities_1 = require("../src/database/entities");
const lab_entity_1 = require("../src/entities/lab.entity");
const test_entity_1 = require("../src/entities/test.entity");
const pricing_entity_1 = require("../src/entities/pricing.entity");
const test_component_entity_1 = require("../src/entities/test-component.entity");
const order_test_entity_1 = require("../src/entities/order-test.entity");
const department_entity_1 = require("../src/entities/department.entity");
const tests_service_1 = require("../src/tests/tests.service");
(0, dotenv_1.config)({ path: (0, path_1.join)(__dirname, '..', '.env') });
function createDataSource() {
    if (process.env.DATABASE_URL) {
        return new typeorm_1.DataSource({
            type: 'postgres',
            url: process.env.DATABASE_URL,
            entities: entities_1.DATABASE_ENTITIES,
            synchronize: false,
        });
    }
    return new typeorm_1.DataSource({
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_DATABASE || 'lis',
        entities: entities_1.DATABASE_ENTITIES,
        synchronize: false,
    });
}
function parseArg(name) {
    const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));
    if (!exact)
        return undefined;
    const value = exact.split('=').slice(1).join('=').trim();
    return value.length ? value : undefined;
}
async function getPanelCounts(dataSource, labId) {
    const rows = await dataSource.query(`
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
    `, [labId]);
    const map = new Map();
    for (const row of rows) {
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
        const labRepo = dataSource.getRepository(lab_entity_1.Lab);
        const lab = (await labRepo.findOne({ where: { code: labCode } })) ??
            (await labRepo.findOne({ where: { name: fallbackLabName } }));
        if (!lab) {
            throw new Error(`Lab not found (searched code="${labCode}", name="${fallbackLabName}")`);
        }
        const testsService = new tests_service_1.TestsService(dataSource.getRepository(test_entity_1.Test), dataSource.getRepository(pricing_entity_1.Pricing), dataSource.getRepository(test_component_entity_1.TestComponent), dataSource.getRepository(order_test_entity_1.OrderTest), dataSource.getRepository(department_entity_1.Department));
        const before = await getPanelCounts(dataSource, lab.id);
        console.log(JSON.stringify({
            event: 'panel.seed.baseline',
            labId: lab.id,
            labCode: lab.code,
            labName: lab.name,
            counts: before,
        }, null, 2));
        const cbc = await testsService.seedCBCTests(lab.id);
        const gue = await testsService.seedUrinalysisTests(lab.id);
        const after = await getPanelCounts(dataSource, lab.id);
        console.log(JSON.stringify({
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
        }, null, 2));
    }
    catch (error) {
        const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
        console.error('CBC/GUE reseed failed:', message);
        process.exitCode = 1;
    }
    finally {
        await dataSource.destroy();
    }
}
void run();
//# sourceMappingURL=seed-panel-cbc-gue.js.map