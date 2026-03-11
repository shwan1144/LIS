"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const path_1 = require("path");
const typeorm_1 = require("typeorm");
const entities_1 = require("../src/database/entities");
const order_entity_1 = require("../src/entities/order.entity");
const order_test_entity_1 = require("../src/entities/order-test.entity");
const test_entity_1 = require("../src/entities/test.entity");
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
    return value.length > 0 ? value : undefined;
}
function derivePanelStatusFromChildren(childStatuses, currentStatus) {
    if (childStatuses.length === 0) {
        return currentStatus === order_test_entity_1.OrderTestStatus.REJECTED
            ? order_test_entity_1.OrderTestStatus.REJECTED
            : order_test_entity_1.OrderTestStatus.VERIFIED;
    }
    if (childStatuses.some((status) => status === order_test_entity_1.OrderTestStatus.REJECTED)) {
        return order_test_entity_1.OrderTestStatus.REJECTED;
    }
    if (childStatuses.every((status) => status === order_test_entity_1.OrderTestStatus.VERIFIED)) {
        return order_test_entity_1.OrderTestStatus.VERIFIED;
    }
    if (childStatuses.every((status) => status !== order_test_entity_1.OrderTestStatus.PENDING && status !== order_test_entity_1.OrderTestStatus.IN_PROGRESS)) {
        return order_test_entity_1.OrderTestStatus.COMPLETED;
    }
    return order_test_entity_1.OrderTestStatus.IN_PROGRESS;
}
function bumpCounter(map, key) {
    map[key] = (map[key] ?? 0) + 1;
}
async function syncOrderStatus(orderId, dataSource) {
    const orderRepo = dataSource.getRepository(order_entity_1.Order);
    const orderTestRepo = dataSource.getRepository(order_test_entity_1.OrderTest);
    const order = await orderRepo.findOne({ where: { id: orderId } });
    if (!order || order.status === order_entity_1.OrderStatus.CANCELLED) {
        return false;
    }
    const testRows = await orderTestRepo
        .createQueryBuilder('ot')
        .innerJoin('ot.sample', 'sample')
        .where('sample.orderId = :orderId', { orderId })
        .select(['ot.status AS status'])
        .getRawMany();
    if (testRows.length === 0) {
        return false;
    }
    const allFinalized = testRows.every((row) => row.status === order_test_entity_1.OrderTestStatus.VERIFIED || row.status === order_test_entity_1.OrderTestStatus.REJECTED);
    const nextOrderStatus = allFinalized
        ? order_entity_1.OrderStatus.COMPLETED
        : order_entity_1.OrderStatus.REGISTERED;
    if (order.status !== nextOrderStatus) {
        order.status = nextOrderStatus;
        await orderRepo.save(order);
        return true;
    }
    return false;
}
async function run() {
    const orderNumbersArg = parseArg('--order-numbers');
    const targetOrderNumbers = orderNumbersArg
        ? orderNumbersArg
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
    const dataSource = createDataSource();
    try {
        await dataSource.initialize();
        const orderTestRepo = dataSource.getRepository(order_test_entity_1.OrderTest);
        const rootsQb = orderTestRepo
            .createQueryBuilder('ot')
            .innerJoin('ot.test', 'test')
            .innerJoin('ot.sample', 'sample')
            .innerJoin('sample.order', 'ord')
            .where('ot."parentOrderTestId" IS NULL')
            .andWhere('test.type = :panelType', { panelType: test_entity_1.TestType.PANEL })
            .select([
            'ot.id AS "panelRootId"',
            'ot.status AS "currentStatus"',
            'sample.orderId AS "orderId"',
            'ord.orderNumber AS "orderNumber"',
            'test.code AS "panelCode"',
        ]);
        if (targetOrderNumbers.length > 0) {
            rootsQb.andWhere('ord.orderNumber IN (:...targetOrderNumbers)', {
                targetOrderNumbers,
            });
        }
        const panelRoots = await rootsQb.getRawMany();
        if (panelRoots.length === 0) {
            console.log(JSON.stringify({
                event: 'repair.stale_panel_roots.empty',
                message: 'No panel roots found for repair',
                filterOrderNumbers: targetOrderNumbers,
            }, null, 2));
            return;
        }
        const rootIds = panelRoots.map((row) => row.panelRootId);
        const children = await orderTestRepo.find({
            where: { parentOrderTestId: (0, typeorm_1.In)(rootIds) },
            select: ['id', 'parentOrderTestId', 'status'],
        });
        const childrenByParent = new Map();
        for (const child of children) {
            const parentId = child.parentOrderTestId;
            if (!parentId)
                continue;
            const list = childrenByParent.get(parentId) ?? [];
            list.push(child.status);
            childrenByParent.set(parentId, list);
        }
        const beforeCounts = {};
        const afterCounts = {};
        const updatedCountsByStatus = {};
        const ordersToSync = new Set();
        const touchedOrderNumbers = new Set();
        let rootsWithoutChildren = 0;
        let updatedRoots = 0;
        for (const root of panelRoots) {
            bumpCounter(beforeCounts, root.currentStatus);
            const childStatuses = childrenByParent.get(root.panelRootId) ?? [];
            const expectedStatus = derivePanelStatusFromChildren(childStatuses, root.currentStatus);
            if (childStatuses.length === 0)
                rootsWithoutChildren++;
            if (expectedStatus !== root.currentStatus) {
                await orderTestRepo.update(root.panelRootId, { status: expectedStatus });
                updatedRoots++;
                ordersToSync.add(root.orderId);
                touchedOrderNumbers.add(root.orderNumber);
                bumpCounter(updatedCountsByStatus, `${root.currentStatus}->${expectedStatus}`);
                bumpCounter(afterCounts, expectedStatus);
            }
            else {
                bumpCounter(afterCounts, root.currentStatus);
            }
        }
        let updatedOrders = 0;
        for (const orderId of ordersToSync) {
            if (await syncOrderStatus(orderId, dataSource)) {
                updatedOrders++;
            }
        }
        console.log(JSON.stringify({
            event: 'repair.stale_panel_roots.result',
            rootsScanned: panelRoots.length,
            rootsUpdated: updatedRoots,
            rootsWithoutChildren,
            ordersSynced: ordersToSync.size,
            ordersStatusUpdated: updatedOrders,
            statusCountsBefore: beforeCounts,
            statusCountsAfter: afterCounts,
            updatedStatusTransitions: updatedCountsByStatus,
            sampleUpdatedOrderNumbers: Array.from(touchedOrderNumbers).slice(0, 50),
            filterOrderNumbers: targetOrderNumbers,
        }, null, 2));
    }
    catch (error) {
        const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
        console.error('Repair stale panel roots failed:', detail);
        process.exitCode = 1;
    }
    finally {
        await dataSource.destroy();
    }
}
void run();
//# sourceMappingURL=repair-stale-panel-roots.js.map