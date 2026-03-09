import type { Repository } from 'typeorm';
import { OrdersService } from './orders.service';
import { Order } from '../entities/order.entity';
import { Patient } from '../entities/patient.entity';
import { Lab } from '../entities/lab.entity';
import { Shift } from '../entities/shift.entity';
import { Test, TestType } from '../entities/test.entity';
import { Pricing } from '../entities/pricing.entity';
import { TestComponent } from '../entities/test-component.entity';
import { LabOrdersWorklist } from '../entities/lab-orders-worklist.entity';
import { OrderTest, OrderTestStatus } from '../entities/order-test.entity';

function createService(): OrdersService {
  return new OrdersService(
    {} as Repository<Order>,
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

describe('OrdersService panel removal access', () => {
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
});
