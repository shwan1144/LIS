import type { Order } from '../entities/order.entity';
import type { OrderTest } from '../entities/order-test.entity';
import { OrderTestStatus } from '../entities/order-test.entity';
import { ReportsService } from './reports.service';

function buildOrder(id: string, orderNumber: string | null, registeredAt: string): Order {
  return {
    id,
    orderNumber,
    registeredAt: new Date(registeredAt),
  } as unknown as Order;
}

function buildOrderTest(orderId: string, options?: { verified?: boolean; id?: string }): OrderTest {
  const verified = options?.verified ?? true;
  const id = options?.id ?? `ot-${orderId}`;
  return {
    id,
    status: verified ? OrderTestStatus.VERIFIED : OrderTestStatus.COMPLETED,
    verifiedAt: verified ? new Date('2026-03-01T10:00:00.000Z') : null,
    sample: {
      orderId,
    },
  } as unknown as OrderTest;
}

function createOrderQueryBuilder(orders: Order[]) {
  return {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(orders),
  };
}

function createOrderTestQueryBuilder(orderTests: OrderTest[]) {
  return {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(orderTests),
  };
}

describe('ReportsService.searchPublicResultHistory', () => {
  let service: ReportsService;
  let orderRepo: { createQueryBuilder: jest.Mock };
  let orderTestRepo: { createQueryBuilder: jest.Mock };

  beforeEach(() => {
    service = Object.create(ReportsService.prototype) as ReportsService;
    orderRepo = { createQueryBuilder: jest.fn() };
    orderTestRepo = { createQueryBuilder: jest.fn() };

    (service as unknown as { orderRepo: unknown }).orderRepo = orderRepo;
    (service as unknown as { orderTestRepo: unknown }).orderTestRepo = orderTestRepo;
    (
      service as unknown as {
        getReportableOrderTests: (orderTests: OrderTest[]) => OrderTest[];
      }
    ).getReportableOrderTests = jest.fn((orderTests: OrderTest[]) => orderTests);
  });

  it('applies exact patient + birth year filters and lab scoping', async () => {
    const order = buildOrder(
      '11111111-1111-4111-8111-111111111111',
      'ORD-001',
      '2026-03-05T10:00:00.000Z',
    );

    const orderQb = createOrderQueryBuilder([order]);
    const orderTestQb = createOrderTestQueryBuilder([buildOrderTest(order.id)]);
    orderRepo.createQueryBuilder.mockReturnValue(orderQb);
    orderTestRepo.createQueryBuilder.mockReturnValue(orderTestQb);

    const rows = await service.searchPublicResultHistory({
      labId: 'lab-1',
      patientNumber: 'P-0001',
      birthYear: 1990,
      limit: 20,
    });

    expect(orderQb.where).toHaveBeenCalledWith('order.labId = :labId', { labId: 'lab-1' });
    expect(orderQb.andWhere).toHaveBeenCalledWith('order.paymentStatus = :paymentStatus', {
      paymentStatus: 'paid',
    });
    expect(orderQb.andWhere).toHaveBeenCalledWith(
      'LOWER(patient.patientNumber) = LOWER(:patientNumber)',
      { patientNumber: 'P-0001' },
    );
    expect(orderQb.andWhere).toHaveBeenCalledWith(
      'EXTRACT(YEAR FROM patient.dateOfBirth) = :birthYear',
      { birthYear: 1990 },
    );
    expect(rows).toEqual([
      {
        orderId: order.id,
        orderNumber: 'ORD-001',
        registeredAt: '2026-03-05T10:00:00.000Z',
      },
    ]);
  });

  it('returns only paid-ready orders after reportable verification check', async () => {
    const orderReady = buildOrder(
      '11111111-1111-4111-8111-111111111111',
      'ORD-100',
      '2026-03-06T10:00:00.000Z',
    );
    const orderNotReady = buildOrder(
      '22222222-2222-4222-8222-222222222222',
      'ORD-101',
      '2026-03-05T10:00:00.000Z',
    );
    const orderWithoutReportable = buildOrder(
      '33333333-3333-4333-8333-333333333333',
      'ORD-102',
      '2026-03-04T10:00:00.000Z',
    );

    const orderQb = createOrderQueryBuilder([orderReady, orderNotReady, orderWithoutReportable]);
    const orderTestQb = createOrderTestQueryBuilder([
      buildOrderTest(orderReady.id, { verified: true }),
      buildOrderTest(orderNotReady.id, { verified: false }),
    ]);
    orderRepo.createQueryBuilder.mockReturnValue(orderQb);
    orderTestRepo.createQueryBuilder.mockReturnValue(orderTestQb);

    const rows = await service.searchPublicResultHistory({
      labId: 'lab-1',
      patientNumber: 'P-0001',
      birthYear: 1990,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.orderId).toBe(orderReady.id);
  });

  it('returns newest-first and caps output to 50 rows', async () => {
    const orders = Array.from({ length: 55 }, (_, idx) => {
      const registeredAt = new Date(Date.UTC(2026, 0, 55 - idx)).toISOString();
      const idPrefix = String(idx + 1).padStart(8, '0');
      return buildOrder(
        `${idPrefix}-1111-4111-8111-111111111111`,
        `ORD-${idx + 1}`,
        registeredAt,
      );
    });

    const orderQb = createOrderQueryBuilder(orders);
    const allOrderTests = orders.map((order) => buildOrderTest(order.id, { verified: true }));
    const orderTestQb = createOrderTestQueryBuilder(allOrderTests);
    orderRepo.createQueryBuilder.mockReturnValue(orderQb);
    orderTestRepo.createQueryBuilder.mockReturnValue(orderTestQb);

    const rows = await service.searchPublicResultHistory({
      labId: 'lab-1',
      patientNumber: 'P-0001',
      birthYear: 1990,
      limit: 999,
    });

    expect(rows).toHaveLength(50);
    expect(rows[0]?.orderId).toBe(orders[0]?.id);
    expect(rows[49]?.orderId).toBe(orders[49]?.id);
    expect(orderQb.orderBy).toHaveBeenCalledWith('order.registeredAt', 'DESC');
  });

  it('returns empty for invalid birth year without querying repositories', async () => {
    const rows = await service.searchPublicResultHistory({
      labId: 'lab-1',
      patientNumber: 'P-0001',
      birthYear: 1899,
    });

    expect(rows).toEqual([]);
    expect(orderRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(orderTestRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
