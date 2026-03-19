import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { EntityManager, Repository } from 'typeorm';
import { SubLabsService } from './sub-labs.service';
import { SubLab } from '../entities/sub-lab.entity';
import { SubLabTestPrice } from '../entities/sub-lab-test-price.entity';
import { User } from '../entities/user.entity';
import { Test, TestType } from '../entities/test.entity';
import { Order, OrderStatus, PatientType } from '../entities/order.entity';
import { OrderTest, OrderTestStatus } from '../entities/order-test.entity';
import { OrderDetailView } from '../orders/dto/create-order-response.dto';

function createPortalOrderTest(
  status: OrderTestStatus,
  type: TestType,
  overrides?: Partial<OrderTest>,
): OrderTest {
  return {
    id: overrides?.id ?? `${type}-${status}`,
    labId: 'lab-1',
    sampleId: 'sample-1',
    testId: 'test-1',
    parentOrderTestId: overrides?.parentOrderTestId ?? null,
    status,
    price: null,
    resultValue: null,
    resultText: null,
    resultParameters: null,
    cultureResult: null,
    flag: null,
    resultedAt: null,
    resultedBy: null,
    verifiedAt: null,
    verifiedBy: null,
    rejectionReason: null,
    comments: null,
    resultDocumentStorageKey: null,
    resultDocumentFileName: null,
    resultDocumentMimeType: null,
    resultDocumentSizeBytes: null,
    resultDocumentUploadedAt: null,
    resultDocumentUploadedBy: null,
    panelSortOrder: null,
    createdAt: new Date('2026-03-17T00:00:00.000Z'),
    updatedAt: new Date('2026-03-17T00:00:00.000Z'),
    sample: null as never,
    lab: null,
    test: {
      id: 'test-1',
      labId: 'lab-1',
      code: 'TEST',
      name: 'Test',
      type,
    } as Test,
    parentOrderTest: null,
    childOrderTests: [],
    ...overrides,
  } as OrderTest;
}

function createPortalOrder(
  rootTests: OrderTest[],
  overrides?: Partial<Order>,
): Order {
  return {
    id: overrides?.id ?? 'order-1',
    patientId: 'patient-1',
    labId: 'lab-1',
    shiftId: null,
    sourceSubLabId: overrides?.sourceSubLabId ?? 'sub-1',
    orderNumber: '26031001',
    status: overrides?.status ?? OrderStatus.COMPLETED,
    patientType: overrides?.patientType ?? PatientType.WALK_IN,
    notes: null,
    totalAmount: 0,
    discountPercent: 0,
    finalAmount: 0,
    paymentStatus: 'paid',
    paidAmount: 0,
    registeredAt: new Date('2026-03-17T00:00:00.000Z'),
    deliveryMethods: [],
    reportS3Key: null,
    reportGeneratedAt: null,
    createdAt: new Date('2026-03-17T00:00:00.000Z'),
    updatedAt: new Date('2026-03-17T00:00:00.000Z'),
    patient: null as never,
    lab: null as never,
    shift: null,
    sourceSubLab: null,
    samples: [
      {
        id: 'sample-1',
        labId: 'lab-1',
        orderId: 'order-1',
        sampleId: null,
        tubeType: null,
        barcode: null,
        sequenceNumber: null,
        qrCode: null,
        collectedAt: null,
        notes: null,
        createdAt: new Date('2026-03-17T00:00:00.000Z'),
        updatedAt: new Date('2026-03-17T00:00:00.000Z'),
        order: null as never,
        lab: null,
        orderTests: rootTests,
      },
    ] as Order['samples'],
    ...overrides,
  } as Order;
}

function createPortalServiceContext() {
  const subLabRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: 'sub-1',
      labId: 'lab-1',
      name: 'Portal',
      isActive: true,
    } as SubLab),
    manager: {
      transaction: jest.fn(),
    },
  } as unknown as Repository<SubLab>;

  const ordersService = {
    findOne: jest.fn(),
    findHistory: jest.fn(),
  };
  const reportsService = {
    generateTestResultsPDF: jest.fn(),
  };

  const service = new SubLabsService(
    subLabRepo,
    {} as Repository<SubLabTestPrice>,
    {} as Repository<User>,
    {} as Repository<Test>,
    {} as Repository<Order>,
    ordersService as never,
    reportsService as never,
    {} as never,
  );

  return {
    service,
    subLabRepo,
    ordersService,
    reportsService,
  };
}

describe('SubLabsService', () => {
  it('creates a sub-lab and returns its detail from the same transaction manager', async () => {
    const createdAt = new Date('2026-03-17T00:00:00.000Z');
    const updatedAt = new Date('2026-03-17T00:00:00.000Z');
    const createdSubLab = {
      id: 'sub-1',
      labId: 'lab-1',
      name: 'salar',
      isActive: true,
      createdAt,
      updatedAt,
    } as SubLab;

    const rootSubLabFindOne = jest.fn().mockResolvedValue(null);
    const userFindOne = jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if ('username' in where) {
        return Promise.resolve(null);
      }
      if (where.subLabId === 'sub-1') {
        return Promise.resolve({
          id: 'user-1',
          username: 'salar',
          subLabId: 'sub-1',
          labId: 'lab-1',
        } as User);
      }
      return Promise.resolve(null);
    });
    const userSave = jest.fn().mockImplementation(async (user: User) => ({
      ...user,
      id: 'user-1',
    }));
    const subLabCreate = jest.fn().mockImplementation((payload: Partial<SubLab>) => payload);
    const subLabSave = jest.fn().mockResolvedValue(createdSubLab);
    const subLabFindOne = jest.fn().mockResolvedValue(createdSubLab);
    const priceDelete = jest.fn().mockResolvedValue({ affected: 0 });
    const priceInsert = jest.fn().mockResolvedValue(undefined);
    const priceFind = jest.fn().mockResolvedValue([]);
    const testFind = jest.fn().mockResolvedValue([]);

    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === SubLab) {
          return {
            create: subLabCreate,
            save: subLabSave,
            findOne: subLabFindOne,
          };
        }
        if (entity === User) {
          return {
            findOne: userFindOne,
            save: userSave,
          };
        }
        if (entity === SubLabTestPrice) {
          return {
            delete: priceDelete,
            insert: priceInsert,
            find: priceFind,
          };
        }
        if (entity === Test) {
          return {
            find: testFind,
          };
        }
        throw new Error(`Unexpected repository request: ${String(entity)}`);
      },
    } as unknown as EntityManager;

    const subLabRepo = {
      findOne: rootSubLabFindOne,
      manager: {
        transaction: async (callback: (txnManager: EntityManager) => Promise<unknown>) =>
          callback(manager),
      },
    } as unknown as Partial<Repository<SubLab>>;

    const service = new SubLabsService(
      subLabRepo as Repository<SubLab>,
      {} as Repository<SubLabTestPrice>,
      {} as Repository<User>,
      {} as Repository<Test>,
      {} as Repository<Order>,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.createForLab('lab-1', {
      name: 'salar',
      username: 'salar',
      password: 'secret-123',
      prices: [],
    });

    expect(result).toEqual({
      id: 'sub-1',
      name: 'salar',
      isActive: true,
      createdAt,
      updatedAt,
      username: 'salar',
      prices: [],
    });
    expect(rootSubLabFindOne).not.toHaveBeenCalled();
    expect(subLabFindOne).toHaveBeenCalledWith({
      where: { id: 'sub-1', labId: 'lab-1' },
    });
    expect(priceDelete).toHaveBeenCalledWith({ subLabId: 'sub-1' });
  });

  describe('generatePortalResultsPdf', () => {
    it('allows ready panel orders for the authenticated sub-lab and removes only banner/footer branding', async () => {
      const { service, ordersService, reportsService } = createPortalServiceContext();
      const order = createPortalOrder([
        createPortalOrderTest(OrderTestStatus.VERIFIED, TestType.PANEL),
      ]);
      const pdf = Buffer.from('panel-pdf');

      ordersService.findOne.mockResolvedValue(order);
      reportsService.generateTestResultsPDF.mockResolvedValue(pdf);

      await expect(
        service.generatePortalResultsPdf('lab-1', 'sub-1', 'order-1'),
      ).resolves.toBe(pdf);

      expect(ordersService.findOne).toHaveBeenCalledWith(
        'order-1',
        'lab-1',
        OrderDetailView.FULL,
      );
      expect(reportsService.generateTestResultsPDF).toHaveBeenCalledWith(
        'order-1',
        'lab-1',
        {
          bypassPaymentCheck: true,
          reportDesignOverride: {
            reportBranding: {
              bannerDataUrl: null,
              footerDataUrl: null,
            },
          },
        },
      );
    });

    it('allows ready unpaid panel orders for the authenticated sub-lab', async () => {
      const { service, ordersService, reportsService } = createPortalServiceContext();
      const order = createPortalOrder(
        [createPortalOrderTest(OrderTestStatus.VERIFIED, TestType.PANEL)],
        { paymentStatus: 'unpaid' },
      );
      const pdf = Buffer.from('unpaid-panel-pdf');

      ordersService.findOne.mockResolvedValue(order);
      reportsService.generateTestResultsPDF.mockResolvedValue(pdf);

      await expect(
        service.generatePortalResultsPdf('lab-1', 'sub-1', 'order-1'),
      ).resolves.toBe(pdf);

      expect(reportsService.generateTestResultsPDF).toHaveBeenCalledWith(
        'order-1',
        'lab-1',
        expect.objectContaining({
          bypassPaymentCheck: true,
        }),
      );
    });

    it('allows ready partially paid panel orders for the authenticated sub-lab', async () => {
      const { service, ordersService, reportsService } = createPortalServiceContext();
      const order = createPortalOrder(
        [createPortalOrderTest(OrderTestStatus.VERIFIED, TestType.PANEL)],
        { paymentStatus: 'partial' },
      );
      const pdf = Buffer.from('partial-panel-pdf');

      ordersService.findOne.mockResolvedValue(order);
      reportsService.generateTestResultsPDF.mockResolvedValue(pdf);

      await expect(
        service.generatePortalResultsPdf('lab-1', 'sub-1', 'order-1'),
      ).resolves.toBe(pdf);

      expect(reportsService.generateTestResultsPDF).toHaveBeenCalledWith(
        'order-1',
        'lab-1',
        expect.objectContaining({
          bypassPaymentCheck: true,
        }),
      );
    });

    it('blocks orders that are not report-ready', async () => {
      const { service, ordersService, reportsService } = createPortalServiceContext();
      ordersService.findOne.mockResolvedValue(
        createPortalOrder([
          createPortalOrderTest(OrderTestStatus.COMPLETED, TestType.PANEL),
        ]),
      );

      await expect(
        service.generatePortalResultsPdf('lab-1', 'sub-1', 'order-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(reportsService.generateTestResultsPDF).not.toHaveBeenCalled();
    });

    it('blocks ready orders that do not have a root panel test', async () => {
      const { service, ordersService, reportsService } = createPortalServiceContext();
      ordersService.findOne.mockResolvedValue(
        createPortalOrder([
          createPortalOrderTest(OrderTestStatus.VERIFIED, TestType.SINGLE),
        ]),
      );

      await expect(
        service.generatePortalResultsPdf('lab-1', 'sub-1', 'order-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(reportsService.generateTestResultsPDF).not.toHaveBeenCalled();
    });

    it('hides orders that belong to another sub-lab', async () => {
      const { service, ordersService, reportsService } = createPortalServiceContext();
      ordersService.findOne.mockResolvedValue(
        createPortalOrder(
          [createPortalOrderTest(OrderTestStatus.VERIFIED, TestType.PANEL)],
          { sourceSubLabId: 'sub-2' },
        ),
      );

      await expect(
        service.generatePortalResultsPdf('lab-1', 'sub-1', 'order-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(reportsService.generateTestResultsPDF).not.toHaveBeenCalled();
    });
  });
});
