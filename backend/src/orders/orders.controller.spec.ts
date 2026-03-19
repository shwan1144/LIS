import { OrdersController } from './orders.controller';
import { OrderStatus } from '../entities/order.entity';
import { OrderResultStatus } from './dto/create-order-response.dto';

describe('OrdersController report filters', () => {
  const ordersService = {
    findAll: jest.fn(),
    findHistory: jest.fn(),
  };

  const controller = new OrdersController(ordersService as never);
  const req = {
    user: {
      labId: 'lab-1',
    },
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards departmentId to findAll', async () => {
    ordersService.findAll.mockResolvedValue({ items: [], total: 0, page: 1, size: 25, totalPages: 0 });

    await controller.findAll(
      req,
      '2',
      '25',
      'search term',
      OrderStatus.REGISTERED,
      'patient-1',
      'shift-1',
      'sub-lab-1',
      'department-1',
      '2026-03-01',
      '2026-03-19',
      'Asia/Riyadh',
    );

    expect(ordersService.findAll).toHaveBeenCalledWith('lab-1', {
      page: 2,
      size: 25,
      search: 'search term',
      status: OrderStatus.REGISTERED,
      patientId: 'patient-1',
      shiftId: 'shift-1',
      sourceSubLabId: 'sub-lab-1',
      departmentId: 'department-1',
      startDate: '2026-03-01',
      endDate: '2026-03-19',
      dateFilterTimeZone: 'Asia/Riyadh',
    });
  });

  it('forwards departmentId to findHistory', async () => {
    ordersService.findHistory.mockResolvedValue({ items: [], total: 0, page: 1, size: 25, totalPages: 0 });

    await controller.findHistory(
      req,
      '1',
      '25',
      'patient',
      OrderStatus.COMPLETED,
      'patient-2',
      'shift-2',
      'sub-lab-2',
      'department-2',
      '2026-03-10',
      '2026-03-19',
      'Asia/Riyadh',
      OrderResultStatus.VERIFIED,
    );

    expect(ordersService.findHistory).toHaveBeenCalledWith('lab-1', {
      page: 1,
      size: 25,
      search: 'patient',
      status: OrderStatus.COMPLETED,
      patientId: 'patient-2',
      shiftId: 'shift-2',
      sourceSubLabId: 'sub-lab-2',
      departmentId: 'department-2',
      startDate: '2026-03-10',
      endDate: '2026-03-19',
      dateFilterTimeZone: 'Asia/Riyadh',
      resultStatus: OrderResultStatus.VERIFIED,
    });
  });
});
