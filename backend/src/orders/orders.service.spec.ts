import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { OrdersService } from './orders.service';
import { Order, OrderStatus } from '../entities/order.entity';
import { Patient } from '../entities/patient.entity';
import { Lab } from '../entities/lab.entity';
import { Shift } from '../entities/shift.entity';
import { Test, TestType } from '../entities/test.entity';
import { Pricing } from '../entities/pricing.entity';
import { TestComponent } from '../entities/test-component.entity';
import { LabOrdersWorklist } from '../entities/lab-orders-worklist.entity';
import { OrderTest, OrderTestStatus } from '../entities/order-test.entity';
import { AuditAction, AuditActorType } from '../entities/audit-log.entity';

function createService(overrides?: {
  orderRepo?: Partial<Repository<Order>>;
  auditService?: { log: jest.Mock };
}): OrdersService {
  return new OrdersService(
    (overrides?.orderRepo ?? {}) as Repository<Order>,
    {} as Repository<Patient>,
    {} as Repository<Lab>,
    {} as Repository<Shift>,
    {} as Repository<Test>,
    {} as Repository<Pricing>,
    {} as Repository<TestComponent>,
    {} as Repository<LabOrdersWorklist>,
    (overrides?.auditService ?? { log: jest.fn().mockResolvedValue(undefined) }) as never,
  );
}

function createOrderTest(
  status: OrderTestStatus,
  type: TestType = TestType.SINGLE,
): OrderTest {
  return {
    id: `order-test-${status}-${type}`,
    testId: `test-${status}-${type}`,
    parentOrderTestId: null,
    status,
    test: {
      id: `test-${status}-${type}`,
      code: `T-${status}`,
      name: `Test ${status}`,
      type,
    },
  } as unknown as OrderTest;
}

function createOrder(overrides?: {
  registeredAt?: Date;
  timezone?: string | null;
  status?: OrderStatus;
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  collectedAt?: Date | null;
  rootStatuses?: OrderTestStatus[];
  sequenceNumber?: number;
}): Order {
  const rootStatuses = overrides?.rootStatuses ?? [OrderTestStatus.PENDING];

  return {
    id: 'order-1',
    patientId: 'patient-1',
    orderNumber: '260309001',
    registeredAt: overrides?.registeredAt ?? new Date('2026-03-09T10:00:00.000Z'),
    status: overrides?.status ?? OrderStatus.REGISTERED,
    paymentStatus: overrides?.paymentStatus ?? 'unpaid',
    paidAmount: null,
    totalAmount: 5000,
    finalAmount: 5000,
    discountPercent: 0,
    deliveryMethods: [],
    samples: [
      {
        id: 'sample-1',
        sequenceNumber: overrides?.sequenceNumber ?? 7,
        collectedAt: overrides?.collectedAt ?? null,
        orderTests: rootStatuses.map((status, index) => ({
          ...createOrderTest(status),
          id: `order-test-${index + 1}`,
          testId: `test-${index + 1}`,
        })),
      },
    ],
    patient: {
      id: 'patient-1',
      fullName: 'Patient One',
    },
    lab: {
      id: 'lab-1',
      timezone: overrides?.timezone ?? 'UTC',
    },
    shift: null,
  } as unknown as Order;
}

function createCancelService(order: Order, updatedOrder?: Order) {
  const transactionFindOne = jest.fn().mockResolvedValue(order);
  const update = jest.fn().mockResolvedValue({ affected: 1 });
  const findOne = jest.fn().mockResolvedValue(
    updatedOrder ?? ({ ...order, status: OrderStatus.CANCELLED } as Order),
  );
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  const orderRepo = {
    findOne,
    manager: {
      transaction: async (
        callback: (manager: {
          getRepository: (entity: unknown) => unknown;
        }) => Promise<unknown>,
      ) =>
        callback({
          getRepository: (entity: unknown) => {
            if (entity === Order) {
              return {
                findOne: transactionFindOne,
                update,
              } as unknown as Partial<Repository<Order>>;
            }
            return {};
          },
        }),
    },
  } as unknown as Partial<Repository<Order>>;

  return {
    service: createService({ orderRepo, auditService }),
    transactionFindOne,
    update,
    findOne,
    auditService,
  };
}

describe('OrdersService panel removal access and cancellation', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('requires admin override for in-progress panels', () => {
    const service = createService();
    const access = (service as any).getRootOrderTestRemovalAccess(
      createOrderTest(OrderTestStatus.IN_PROGRESS, TestType.PANEL),
      [createOrderTest(OrderTestStatus.PENDING), createOrderTest(OrderTestStatus.COMPLETED)],
    );

    expect(access).toEqual({
      removable: true,
      requiresAdminOverride: true,
      blockedReason: null,
    });
  });

  it('keeps in-progress single tests locked', () => {
    const service = createService();
    const access = (service as any).getRootOrderTestRemovalAccess(
      createOrderTest(OrderTestStatus.IN_PROGRESS, TestType.SINGLE),
      [],
    );

    expect(access).toEqual({
      removable: false,
      requiresAdminOverride: false,
      blockedReason:
        'Only pending, completed, and rejected tests can be removed. In-progress tests stay locked.',
    });
  });

  it('allows same-day order test edits in the lab timezone', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    const service = createService();

    expect(() =>
      (service as any).assertOrderTestsEditableToday(
        createOrder({
          registeredAt: new Date('2026-03-09T01:00:00.000Z'),
          timezone: 'UTC',
        }),
      ),
    ).not.toThrow();
  });

  it('rejects older order test edits outside the current lab day', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    const service = createService();

    expect(() =>
      (service as any).assertOrderTestsEditableToday(
        createOrder({
          registeredAt: new Date('2026-03-08T23:59:59.000Z'),
          timezone: 'UTC',
        }),
      ),
    ).toThrow(new BadRequestException("Only today's orders can be edited."));
  });

  it('uses the lab timezone rather than UTC date boundaries', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T01:00:00.000Z'));
    const service = createService();

    expect(() =>
      (service as any).assertOrderTestsEditableToday(
        createOrder({
          registeredAt: new Date('2026-03-08T23:30:00.000Z'),
          timezone: 'Pacific/Honolulu',
        }),
      ),
    ).not.toThrow();
  });

  it('falls back to UTC when the order timezone is invalid or missing', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T10:00:00.000Z'));
    const service = createService();

    expect(() =>
      (service as any).assertOrderTestsEditableToday(
        createOrder({
          registeredAt: new Date('2026-03-09T08:00:00.000Z'),
          timezone: 'Not/A_Real_Timezone',
        }),
      ),
    ).not.toThrow();

    expect(() =>
      (service as any).assertOrderTestsEditableToday(
        createOrder({
          registeredAt: new Date('2026-03-08T23:30:00.000Z'),
          timezone: null,
        }),
      ),
    ).toThrow(new BadRequestException("Only today's orders can be edited."));
  });

  it('keeps cancelled-order rejection priority ahead of the today-only rule', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    const findOne = jest.fn().mockResolvedValue(
      createOrder({
        registeredAt: new Date('2026-03-08T12:00:00.000Z'),
        timezone: 'UTC',
        status: OrderStatus.CANCELLED,
      }),
    );
    const orderRepo = {
      manager: {
        transaction: async (
          callback: (manager: {
            getRepository: (entity: unknown) => unknown;
          }) => Promise<unknown>,
        ) =>
          callback({
            getRepository: (entity: unknown) => {
              if (entity === Order) {
                return { findOne };
              }
              return {};
            },
          }),
      },
    } as Partial<Repository<Order>>;
    const service = createService({ orderRepo });

    await expect(
      service.updateOrderTests(
        'order-1',
        'lab-1',
        ['test-1'],
        { actorType: AuditActorType.LAB_USER, actorId: 'user-1' } as never,
        'LAB_USER',
      ),
    ).rejects.toThrow('Cancelled order cannot be edited');
    expect(findOne).toHaveBeenCalled();
  });

  it('cancels an eligible order without changing sample sequence numbers', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    const originalOrder = createOrder({
      registeredAt: new Date('2026-03-09T08:00:00.000Z'),
      paymentStatus: 'unpaid',
      rootStatuses: [OrderTestStatus.PENDING, OrderTestStatus.PENDING],
      sequenceNumber: 12,
    });
    const updatedOrder = {
      ...originalOrder,
      status: OrderStatus.CANCELLED,
    } as Order;
    const { service, update, findOne, auditService } = createCancelService(
      originalOrder,
      updatedOrder,
    );

    const result = await service.cancelOrder(
      'order-1',
      'lab-1',
      {
        userId: 'user-1',
        actorType: AuditActorType.LAB_USER,
        actorId: 'user-1',
        isImpersonation: false,
        platformUserId: null,
      },
      '  duplicate request  ',
    );

    expect(update).toHaveBeenCalledWith(
      { id: 'order-1', labId: 'lab-1' },
      { status: OrderStatus.CANCELLED },
    );
    expect(findOne).toHaveBeenCalled();
    expect(result.status).toBe(OrderStatus.CANCELLED);
    expect(result.samples[0]?.sequenceNumber).toBe(12);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ORDER_CANCEL,
        actorType: AuditActorType.LAB_USER,
        newValues: expect.objectContaining({
          status: OrderStatus.CANCELLED,
          reason: 'duplicate request',
          sampleCount: 1,
          rootTestsCount: 2,
        }),
      }),
    );
  });

  it('rejects cancellation for already-cancelled orders', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    const { service } = createCancelService(
      createOrder({
        status: OrderStatus.CANCELLED,
      }),
    );

    await expect(
      service.cancelOrder(
        'order-1',
        'lab-1',
        {
          userId: 'user-1',
          actorType: AuditActorType.LAB_USER,
          actorId: 'user-1',
          isImpersonation: false,
          platformUserId: null,
        },
      ),
    ).rejects.toThrow('Order is already cancelled');
  });

  it('rejects cancellation for non-today orders', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    const { service } = createCancelService(
      createOrder({
        registeredAt: new Date('2026-03-08T08:00:00.000Z'),
      }),
    );

    await expect(
      service.cancelOrder(
        'order-1',
        'lab-1',
        {
          userId: 'user-1',
          actorType: AuditActorType.LAB_USER,
          actorId: 'user-1',
          isImpersonation: false,
          platformUserId: null,
        },
      ),
    ).rejects.toThrow("Only today's orders can be edited.");
  });

  it('rejects cancellation for partially paid orders', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    const { service } = createCancelService(
      createOrder({
        paymentStatus: 'partial',
      }),
    );

    await expect(
      service.cancelOrder(
        'order-1',
        'lab-1',
        {
          userId: 'user-1',
          actorType: AuditActorType.LAB_USER,
          actorId: 'user-1',
          isImpersonation: false,
          platformUserId: null,
        },
      ),
    ).rejects.toThrow('Only unpaid orders can be cancelled.');
  });

  it('allows cancellation for collected orders with entered or verified results', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    const originalOrder = createOrder({
        collectedAt: new Date('2026-03-09T09:00:00.000Z'),
        rootStatuses: [OrderTestStatus.COMPLETED, OrderTestStatus.VERIFIED],
      });
    const updatedOrder = {
      ...originalOrder,
      status: OrderStatus.CANCELLED,
    } as Order;
    const { service, update } = createCancelService(
      originalOrder,
      updatedOrder,
    );

    const result = await service.cancelOrder(
      'order-1',
      'lab-1',
      {
        userId: 'user-1',
        actorType: AuditActorType.LAB_USER,
        actorId: 'user-1',
        isImpersonation: false,
        platformUserId: null,
      },
    );

    expect(update).toHaveBeenCalledWith(
      { id: 'order-1', labId: 'lab-1' },
      { status: OrderStatus.CANCELLED },
    );
    expect(result.status).toBe(OrderStatus.CANCELLED);
  });

  it('rejects payment and delivery mutations for cancelled orders', async () => {
    const cancelledOrder = createOrder({ status: OrderStatus.CANCELLED });
    const save = jest.fn();
    const orderRepo = {
      findOne: jest.fn().mockResolvedValue(cancelledOrder),
      save,
    } as Partial<Repository<Order>>;
    const service = createService({ orderRepo });

    await expect(
      service.updatePayment('order-1', 'lab-1', { paymentStatus: 'paid' }),
    ).rejects.toThrow('Cancelled order cannot be edited');
    await expect(
      service.updateDeliveryMethods('order-1', 'lab-1', ['PRINT']),
    ).rejects.toThrow('Cancelled order cannot be edited');
    expect(save).not.toHaveBeenCalled();
  });

  it('updates referred by for an eligible same-day order', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    const originalOrder = createOrder();
    const updatedOrder = {
      ...originalOrder,
      notes: 'Dr Sami',
    } as Order;
    const findOne = jest
      .fn()
      .mockResolvedValueOnce(originalOrder)
      .mockResolvedValueOnce(updatedOrder);
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const orderRepo = {
      findOne,
      update,
    } as Partial<Repository<Order>>;
    const service = createService({ orderRepo, auditService });

    const result = await service.updateNotes(
      'order-1',
      'lab-1',
      'Dr Sami',
      {
        userId: 'user-1',
        actorType: AuditActorType.LAB_USER,
        actorId: 'user-1',
        isImpersonation: false,
        platformUserId: null,
      },
    );

    expect(update).toHaveBeenCalledWith(
      { id: 'order-1', labId: 'lab-1' },
      { notes: 'Dr Sami' },
    );
    expect(result.notes).toBe('Dr Sami');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ORDER_UPDATE,
        newValues: expect.objectContaining({ notes: 'Dr Sami' }),
      }),
    );
  });

  it('rejects referred by updates for cancelled orders', async () => {
    const cancelledOrder = createOrder({ status: OrderStatus.CANCELLED });
    const update = jest.fn();
    const orderRepo = {
      findOne: jest.fn().mockResolvedValue(cancelledOrder),
      update,
    } as Partial<Repository<Order>>;
    const service = createService({ orderRepo });

    await expect(
      service.updateNotes(
        'order-1',
        'lab-1',
        'Dr Sami',
        {
          userId: 'user-1',
          actorType: AuditActorType.LAB_USER,
          actorId: 'user-1',
          isImpersonation: false,
          platformUserId: null,
        },
      ),
    ).rejects.toThrow('Cancelled order cannot be edited');
    expect(update).not.toHaveBeenCalled();
  });
});
