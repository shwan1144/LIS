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

function createService(overrides?: {
  orderRepo?: Partial<Repository<Order>>;
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
    {} as never,
  );
}

function createOrderTest(
  status: OrderTestStatus,
  type: TestType = TestType.SINGLE,
): OrderTest {
  return {
    status,
    test: {
      type,
    },
  } as unknown as OrderTest;
}

function createOrder(overrides?: {
  registeredAt?: Date;
  timezone?: string | null;
  status?: OrderStatus;
}): Order {
  return {
    id: 'order-1',
    registeredAt: overrides?.registeredAt ?? new Date('2026-03-09T10:00:00.000Z'),
    status: overrides?.status ?? OrderStatus.REGISTERED,
    samples: [],
    lab: {
      timezone: overrides?.timezone ?? 'UTC',
    },
  } as unknown as Order;
}

describe('OrdersService panel removal access', () => {
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
        { actorType: 'lab_user', actorId: 'user-1' } as never,
        'LAB_USER',
      ),
    ).rejects.toThrow('Cancelled order cannot be edited');
    expect(findOne).toHaveBeenCalled();
  });
});
