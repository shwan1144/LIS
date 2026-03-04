/**
 * Repair stale panel root statuses using order-local child rows.
 *
 * Usage:
 *   npm run repair:stale-panel-roots
 *   npm run repair:stale-panel-roots -- --order-numbers=260304017,260304015
 */
import { config } from 'dotenv';
import { join } from 'path';
import { DataSource, In } from 'typeorm';
import { DATABASE_ENTITIES } from '../src/database/entities';
import { Order, OrderStatus } from '../src/entities/order.entity';
import { OrderTest, OrderTestStatus } from '../src/entities/order-test.entity';
import { TestType } from '../src/entities/test.entity';

config({ path: join(__dirname, '..', '.env') });

interface PanelRootRow {
  panelRootId: string;
  currentStatus: OrderTestStatus;
  orderId: string;
  orderNumber: string;
  panelCode: string;
}

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
  return value.length > 0 ? value : undefined;
}

function derivePanelStatusFromChildren(
  childStatuses: OrderTestStatus[],
  currentStatus: OrderTestStatus,
): OrderTestStatus {
  if (childStatuses.length === 0) {
    return currentStatus === OrderTestStatus.REJECTED
      ? OrderTestStatus.REJECTED
      : OrderTestStatus.VERIFIED;
  }
  if (childStatuses.some((status) => status === OrderTestStatus.REJECTED)) {
    return OrderTestStatus.REJECTED;
  }
  if (childStatuses.every((status) => status === OrderTestStatus.VERIFIED)) {
    return OrderTestStatus.VERIFIED;
  }
  if (
    childStatuses.every(
      (status) =>
        status !== OrderTestStatus.PENDING && status !== OrderTestStatus.IN_PROGRESS,
    )
  ) {
    return OrderTestStatus.COMPLETED;
  }
  return OrderTestStatus.IN_PROGRESS;
}

function bumpCounter(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

async function syncOrderStatus(orderId: string, dataSource: DataSource): Promise<boolean> {
  const orderRepo = dataSource.getRepository(Order);
  const orderTestRepo = dataSource.getRepository(OrderTest);

  const order = await orderRepo.findOne({ where: { id: orderId } });
  if (!order || order.status === OrderStatus.CANCELLED) {
    return false;
  }

  const testRows = await orderTestRepo
    .createQueryBuilder('ot')
    .innerJoin('ot.sample', 'sample')
    .where('sample.orderId = :orderId', { orderId })
    .select(['ot.status AS status'])
    .getRawMany<{ status: OrderTestStatus }>();

  if (testRows.length === 0) {
    return false;
  }

  const allFinalized = testRows.every(
    (row) =>
      row.status === OrderTestStatus.VERIFIED || row.status === OrderTestStatus.REJECTED,
  );
  const nextOrderStatus = allFinalized
    ? OrderStatus.COMPLETED
    : OrderStatus.REGISTERED;

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
    const orderTestRepo = dataSource.getRepository(OrderTest);

    const rootsQb = orderTestRepo
      .createQueryBuilder('ot')
      .innerJoin('ot.test', 'test')
      .innerJoin('ot.sample', 'sample')
      .innerJoin('sample.order', 'ord')
      .where('ot."parentOrderTestId" IS NULL')
      .andWhere('test.type = :panelType', { panelType: TestType.PANEL })
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

    const panelRoots = await rootsQb.getRawMany<PanelRootRow>();
    if (panelRoots.length === 0) {
      console.log(
        JSON.stringify(
          {
            event: 'repair.stale_panel_roots.empty',
            message: 'No panel roots found for repair',
            filterOrderNumbers: targetOrderNumbers,
          },
          null,
          2,
        ),
      );
      return;
    }

    const rootIds = panelRoots.map((row) => row.panelRootId);
    const children = await orderTestRepo.find({
      where: { parentOrderTestId: In(rootIds) },
      select: ['id', 'parentOrderTestId', 'status'],
    });

    const childrenByParent = new Map<string, OrderTestStatus[]>();
    for (const child of children) {
      const parentId = child.parentOrderTestId;
      if (!parentId) continue;
      const list = childrenByParent.get(parentId) ?? [];
      list.push(child.status);
      childrenByParent.set(parentId, list);
    }

    const beforeCounts: Record<string, number> = {};
    const afterCounts: Record<string, number> = {};
    const updatedCountsByStatus: Record<string, number> = {};
    const ordersToSync = new Set<string>();
    const touchedOrderNumbers = new Set<string>();
    let rootsWithoutChildren = 0;
    let updatedRoots = 0;

    for (const root of panelRoots) {
      bumpCounter(beforeCounts, root.currentStatus);
      const childStatuses = childrenByParent.get(root.panelRootId) ?? [];
      const expectedStatus = derivePanelStatusFromChildren(
        childStatuses,
        root.currentStatus,
      );
      if (childStatuses.length === 0) rootsWithoutChildren++;

      if (expectedStatus !== root.currentStatus) {
        await orderTestRepo.update(root.panelRootId, { status: expectedStatus });
        updatedRoots++;
        ordersToSync.add(root.orderId);
        touchedOrderNumbers.add(root.orderNumber);
        bumpCounter(updatedCountsByStatus, `${root.currentStatus}->${expectedStatus}`);
        bumpCounter(afterCounts, expectedStatus);
      } else {
        bumpCounter(afterCounts, root.currentStatus);
      }
    }

    let updatedOrders = 0;
    for (const orderId of ordersToSync) {
      if (await syncOrderStatus(orderId, dataSource)) {
        updatedOrders++;
      }
    }

    console.log(
      JSON.stringify(
        {
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
        },
        null,
        2,
      ),
    );
  } catch (error: unknown) {
    const detail =
      error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    console.error('Repair stale panel roots failed:', detail);
    process.exitCode = 1;
  } finally {
    await dataSource.destroy();
  }
}

void run();
