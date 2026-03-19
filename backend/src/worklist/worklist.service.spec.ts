import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { AuditActorType } from '../entities/audit-log.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import { Antibiotic } from '../entities/antibiotic.entity';
import { OrderTest, OrderTestStatus } from '../entities/order-test.entity';
import { Lab } from '../entities/lab.entity';
import { TestAntibiotic } from '../entities/test-antibiotic.entity';
import { Test, TestType, TubeType } from '../entities/test.entity';
import { Department } from '../entities/department.entity';
import { UserDepartmentAssignment } from '../entities/user-department-assignment.entity';
import {
  WorklistEntryStatus,
  WorklistOrderMode,
  WorklistService,
} from './worklist.service';
import { LabActorContext } from '../types/lab-actor-context';

type MockRepo<T extends object> = Partial<Record<keyof Repository<T>, jest.Mock>>;

function createActor(): LabActorContext {
  return {
    userId: 'user-1',
    actorType: AuditActorType.LAB_USER,
    actorId: 'user-1',
    isImpersonation: false,
    platformUserId: null,
  };
}

function createTest(overrides: Partial<Test> = {}): Test {
  return {
    id: 'test-1',
    labId: 'lab-1',
    lab: null as never,
    code: 'WBC',
    name: 'White Blood Cell Count',
    abbreviation: 'WBC',
    type: TestType.SINGLE,
    tubeType: TubeType.WHOLE_BLOOD,
    departmentId: null,
    department: null,
    category: null,
    unit: null,
    normalMin: null,
    normalMax: null,
    normalMinMale: null,
    normalMaxMale: null,
    normalMinFemale: null,
    normalMaxFemale: null,
    normalText: null,
    normalTextMale: null,
    normalTextFemale: null,
    resultEntryType: 'NUMERIC',
    resultTextOptions: null,
    allowCustomResultText: false,
    allowPanelSaveWithChildDefaults: false,
    cultureConfig: null,
    numericAgeRanges: null,
    description: null,
    childTestIds: null,
    parameterDefinitions: null,
    sortOrder: 1,
    isActive: true,
    expectedCompletionMinutes: null,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    orderTests: [],
    cultureAntibioticIds: [],
    ...overrides,
  } as unknown as Test;
}

function createOrderTest(overrides: Partial<OrderTest> = {}): OrderTest {
  const order = {
    id: 'order-1',
    labId: 'lab-1',
    status: OrderStatus.REGISTERED,
    patient: null,
  } as unknown as Order;

  return {
    id: 'order-test-1',
    labId: 'lab-1',
    sampleId: 'sample-1',
    testId: 'test-1',
    parentOrderTestId: null,
    status: OrderTestStatus.PENDING,
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
    panelSortOrder: null,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    sample: {
      id: 'sample-1',
      orderId: 'order-1',
      order,
    } as unknown as never,
    lab: null,
    test: createTest(),
    parentOrderTest: null,
    childOrderTests: [],
    ...overrides,
  } as unknown as OrderTest;
}

function createService(
  orderTestRepo: MockRepo<OrderTest>,
  options?: {
    orderRepo?: any;
    labRepo?: MockRepo<Lab>;
    antibioticRepo?: MockRepo<Antibiotic>;
  },
) {
  const panelStatusService = {
    recomputeAfterChildUpdate: jest.fn().mockResolvedValue(undefined),
    recomputePanelStatus: jest.fn().mockResolvedValue(undefined),
  };
  const auditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };
  const reportsService = {
    syncReportToS3: jest.fn().mockResolvedValue(undefined),
  };

  const service = new WorklistService(
    orderTestRepo as unknown as Repository<OrderTest>,
    (options?.orderRepo ?? {}) as unknown as Repository<Order>,
    {} as Repository<Test>,
    {} as Repository<TestAntibiotic>,
    (options?.antibioticRepo ?? {}) as unknown as Repository<Antibiotic>,
    (options?.labRepo ?? {}) as unknown as Repository<Lab>,
    {} as Repository<UserDepartmentAssignment>,
    {} as Repository<Department>,
    panelStatusService as never,
    auditService as never,
    {} as never,
    reportsService as never,
  );

  (service as any).syncOrderStatus = jest.fn().mockResolvedValue(undefined);

  return {
    service,
    panelStatusService,
    auditService,
    reportsService,
  };
}

function createSummaryQueryBuilder(rows: any[]) {
  const qb: Record<string, any> = {
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    andHaving: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getQuery: jest.fn().mockReturnValue('SELECT 1'),
    getParameters: jest.fn().mockReturnValue({}),
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
  return qb;
}

function createCountQueryBuilder(count: string) {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ count }),
  };
}

describe('WorklistService result guards', () => {
  it('returns only cancelled orders when cancelled order filter is selected', async () => {
    const summaryQb = createSummaryQueryBuilder([
      {
        orderId: 'order-cancelled',
        orderNumber: '260319001',
        orderStatus: OrderStatus.CANCELLED,
        registeredAt: new Date('2026-03-19T08:00:00.000Z'),
        patientName: 'Cancelled Patient',
        patientSex: 'male',
        patientDob: null,
        progressTotalRoot: '1',
        progressPending: '1',
        progressCompleted: '0',
        progressVerified: '0',
        progressRejected: '0',
        firstRejectedReason: null,
        notVerifiedCount: '1',
      },
    ]);
    const countQb = createCountQueryBuilder('1');
    const orderTestRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(summaryQb),
    };
    const orderRepo = {
      manager: {
        createQueryBuilder: jest.fn().mockReturnValue(countQb),
      },
    };
    const { service } = createService(orderTestRepo, { orderRepo });
    (service as any).getAllowedDepartmentIdsForUser = jest.fn().mockResolvedValue(null);

    const result = await service.getWorklistOrders(
      'lab-1',
      {
        mode: WorklistOrderMode.ENTRY,
        orderStatus: OrderStatus.CANCELLED,
      },
      'user-1',
    );

    expect(summaryQb.andWhere.mock.calls).toContainEqual([
      'order.status = :cancelledOrderStatus',
      { cancelledOrderStatus: OrderStatus.CANCELLED },
    ]);
    expect(summaryQb.having).not.toHaveBeenCalled();
    expect(summaryQb.andHaving).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      orderId: 'order-cancelled',
      orderStatus: OrderStatus.CANCELLED,
      hasEnterable: false,
      hasVerifiable: false,
    });
  });

  it('excludes cancelled orders from normal worklist filters', async () => {
    const summaryQb = createSummaryQueryBuilder([
      {
        orderId: 'order-active',
        orderNumber: '260319002',
        orderStatus: OrderStatus.REGISTERED,
        registeredAt: new Date('2026-03-19T09:00:00.000Z'),
        patientName: 'Active Patient',
        patientSex: 'female',
        patientDob: null,
        progressTotalRoot: '2',
        progressPending: '1',
        progressCompleted: '1',
        progressVerified: '0',
        progressRejected: '0',
        firstRejectedReason: null,
        notVerifiedCount: '2',
      },
    ]);
    const countQb = createCountQueryBuilder('1');
    const orderTestRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(summaryQb),
    };
    const orderRepo = {
      manager: {
        createQueryBuilder: jest.fn().mockReturnValue(countQb),
      },
    };
    const { service } = createService(orderTestRepo, { orderRepo });
    (service as any).getAllowedDepartmentIdsForUser = jest.fn().mockResolvedValue(null);

    const result = await service.getWorklistOrders(
      'lab-1',
      {
        mode: WorklistOrderMode.ENTRY,
        entryStatus: WorklistEntryStatus.PENDING,
      },
      'user-1',
    );

    expect(summaryQb.andWhere.mock.calls).toContainEqual([
      'order.status != :cancelledOrderStatus',
      { cancelledOrderStatus: OrderStatus.CANCELLED },
    ]);
    expect(summaryQb.having).toHaveBeenCalledWith(
      'SUM(CASE WHEN ot.status <> :verifiedStatus THEN 1 ELSE 0 END) > 0',
    );
    expect(summaryQb.andHaving).toHaveBeenCalledWith(
      '(SUM(CASE WHEN ot.status IN (:...pendingStatuses) THEN 1 ELSE 0 END) > 0 OR SUM(CASE WHEN ot.status = :rejectedStatus THEN 1 ELSE 0 END) > 0)',
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      orderId: 'order-active',
      orderStatus: OrderStatus.REGISTERED,
      hasEnterable: true,
      hasVerifiable: true,
    });
  });

  it('rejects completing a test with no real result', async () => {
    const orderTest = createOrderTest();
    const orderTestRepo = {
      findOne: jest.fn().mockResolvedValue(orderTest),
      save: jest.fn(),
    };
    const { service, panelStatusService, auditService } = createService(orderTestRepo);

    await expect(
      service.enterResult(orderTest.id, 'lab-1', createActor(), {
        resultText: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(orderTestRepo.save).not.toHaveBeenCalled();
    expect(panelStatusService.recomputeAfterChildUpdate).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('rejects verifying a test with no real result', async () => {
    const orderTest = createOrderTest({
      status: OrderTestStatus.COMPLETED,
    });
    const orderTestRepo = {
      findOne: jest.fn().mockResolvedValue(orderTest),
      save: jest.fn(),
    };
    const { service, panelStatusService, auditService } = createService(orderTestRepo);

    await expect(
      service.verifyResult(orderTest.id, 'lab-1', createActor()),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(orderTestRepo.save).not.toHaveBeenCalled();
    expect(panelStatusService.recomputeAfterChildUpdate).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('rejects verifying a rejected result until it is re-entered', async () => {
    const orderTest = createOrderTest({
      status: OrderTestStatus.REJECTED,
      resultValue: 4.2,
      resultText: '4.2',
      rejectionReason: 'Review needed',
    });
    const orderTestRepo = {
      findOne: jest.fn().mockResolvedValue(orderTest),
      save: jest.fn(),
    };
    const { service, panelStatusService, auditService } = createService(orderTestRepo);

    await expect(
      service.verifyResult(orderTest.id, 'lab-1', createActor()),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(orderTestRepo.save).not.toHaveBeenCalled();
    expect(panelStatusService.recomputeAfterChildUpdate).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('skips blank rows during batch verification', async () => {
    const blank = createOrderTest({
      id: 'blank-test',
      status: OrderTestStatus.COMPLETED,
    });
    const valid = createOrderTest({
      id: 'valid-test',
      status: OrderTestStatus.COMPLETED,
      resultValue: 7.2,
    });
    const orderTestRepo = {
      find: jest.fn().mockResolvedValue([blank, valid]),
      save: jest.fn().mockResolvedValue([valid]),
    };
    const { service, auditService, reportsService } = createService(orderTestRepo);

    const result = await service.verifyMultiple(
      ['blank-test', 'valid-test'],
      'lab-1',
      createActor(),
    );

    expect(result).toEqual({ verified: 1, failed: 1 });
    expect(orderTestRepo.save).toHaveBeenCalledTimes(1);
    expect(orderTestRepo.save).toHaveBeenCalledWith([valid]);
    expect(valid.status).toBe(OrderTestStatus.VERIFIED);
    expect(blank.status).toBe(OrderTestStatus.COMPLETED);
    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(reportsService.syncReportToS3).toHaveBeenCalledWith('order-1', 'lab-1');
  });

  it('stores culture entry values in shared lab history after save', async () => {
    const cultureTest = createTest({
      resultEntryType: 'CULTURE_SENSITIVITY',
      cultureConfig: {
        interpretationOptions: ['S', 'I', 'R'],
        micUnit: null,
      },
    });
    const orderTest = createOrderTest({
      test: cultureTest,
    });
    const orderTestRepo = {
      findOne: jest.fn().mockResolvedValue(orderTest),
      save: jest.fn().mockImplementation(async (value: OrderTest) => value),
    };
    const labRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'lab-1',
        cultureEntryHistory: {
          microorganisms: ['Old isolate'],
          conditions: ['Mixed growth'],
          colonyCounts: ['10^4 CFU/mL'],
        },
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = createService(orderTestRepo, { labRepo });

    await service.enterResult(orderTest.id, 'lab-1', createActor(), {
      cultureResult: {
        noGrowth: false,
        notes: '',
        isolates: [
          {
            isolateKey: 'isolate-1',
            organism: 'Klebsiella pneumoniae',
            source: 'Urine',
            condition: 'Heavy growth',
            colonyCount: '>10^5 CFU/mL',
            comment: '',
            antibiotics: [
              {
                antibioticCode: 'CRO',
                antibioticName: 'Ceftriaxone',
                interpretation: 'R',
                mic: null,
              },
            ],
          },
        ],
      },
    });

    expect(labRepo.update).toHaveBeenCalledTimes(1);
    expect(labRepo.update).toHaveBeenCalledWith(
      { id: 'lab-1' },
      {
        cultureEntryHistory: {
          microorganisms: ['Klebsiella pneumoniae', 'Old isolate'],
          conditions: ['Heavy growth', 'Mixed growth'],
          colonyCounts: ['>10^5 CFU/mL', '10^4 CFU/mL'],
        },
      },
    );
  });

  it('clears verified metadata when rejecting a completed result', async () => {
    const orderTest = createOrderTest({
      status: OrderTestStatus.COMPLETED,
      resultValue: 6.1,
      resultText: '6.1',
      verifiedAt: new Date('2026-03-01T02:00:00.000Z'),
      verifiedBy: 'verifier-1',
    });
    const orderTestRepo = {
      findOne: jest.fn().mockResolvedValue(orderTest),
      save: jest.fn().mockImplementation(async (value: OrderTest) => value),
    };
    const { service, panelStatusService, auditService } = createService(orderTestRepo);

    const result = await service.rejectResult(
      orderTest.id,
      'lab-1',
      createActor(),
      'Need review',
    );

    expect(result.status).toBe(OrderTestStatus.REJECTED);
    expect(result.rejectionReason).toBe('Need review');
    expect(result.verifiedAt).toBeNull();
    expect(result.verifiedBy).toBeNull();
    expect(panelStatusService.recomputeAfterChildUpdate).toHaveBeenCalledWith(orderTest.id);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RESULT_REJECT',
        newValues: expect.objectContaining({
          status: OrderTestStatus.REJECTED,
          rejectionReason: 'Need review',
        }),
      }),
    );
  });

  it('allows re-saving a rejected result without changing its value', async () => {
    const orderTest = createOrderTest({
      status: OrderTestStatus.REJECTED,
      resultValue: 7.4,
      resultText: '7.4',
      resultedAt: new Date('2026-03-01T01:00:00.000Z'),
      resultedBy: 'tech-1',
      rejectionReason: 'Recheck value',
    });
    const orderTestRepo = {
      findOne: jest.fn().mockResolvedValue(orderTest),
      save: jest.fn().mockImplementation(async (value: OrderTest) => value),
    };
    const { service, panelStatusService, auditService } = createService(orderTestRepo);

    const result = await service.enterResult(orderTest.id, 'lab-1', createActor(), {
      resultValue: 7.4,
      resultText: '7.4',
    });

    expect(result.status).toBe(OrderTestStatus.COMPLETED);
    expect(result.rejectionReason).toBeNull();
    expect(result.resultValue).toBe(7.4);
    expect(result.resultText).toBe('7.4');
    expect(panelStatusService.recomputeAfterChildUpdate).toHaveBeenCalledWith(orderTest.id);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RESULT_UPDATE',
      }),
    );
  });

  it('rejects entering a panel root directly', async () => {
    const panelTest = createTest({
      code: 'GUE',
      name: 'General Urine Examination',
      type: TestType.PANEL,
      allowPanelSaveWithChildDefaults: true,
    });
    const orderTest = createOrderTest({
      test: panelTest,
    });
    const orderTestRepo = {
      findOne: jest.fn().mockResolvedValue(orderTest),
      save: jest.fn(),
    };
    const { service, panelStatusService, auditService } = createService(orderTestRepo);

    await expect(
      service.enterResult(orderTest.id, 'lab-1', createActor(), {
        resultText: 'ignored',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(orderTestRepo.save).not.toHaveBeenCalled();
    expect(panelStatusService.recomputeAfterChildUpdate).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('rejects result entry for cancelled orders', async () => {
    const orderTest = createOrderTest({
      sample: {
        id: 'sample-1',
        orderId: 'order-1',
        order: { id: 'order-1', labId: 'lab-1', status: OrderStatus.CANCELLED } as Order,
      } as unknown as never,
    });
    const orderTestRepo = {
      findOne: jest.fn().mockResolvedValue(orderTest),
      save: jest.fn(),
    };
    const { service } = createService(orderTestRepo);

    await expect(
      service.enterResult(orderTest.id, 'lab-1', createActor(), {
        resultValue: 4.1,
        resultText: '4.1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(orderTestRepo.save).not.toHaveBeenCalled();
  });

  it('counts cancelled rows as failed during batch verification', async () => {
    const cancelled = createOrderTest({
      id: 'cancelled-test',
      status: OrderTestStatus.COMPLETED,
      resultValue: 3.2,
      sample: {
        id: 'sample-1',
        orderId: 'order-1',
        order: { id: 'order-1', labId: 'lab-1', status: OrderStatus.CANCELLED } as Order,
      } as unknown as never,
    });
    const valid = createOrderTest({
      id: 'valid-test',
      status: OrderTestStatus.COMPLETED,
      resultValue: 7.2,
    });
    const orderTestRepo = {
      find: jest.fn().mockResolvedValue([cancelled, valid]),
      save: jest.fn().mockResolvedValue([valid]),
    };
    const { service } = createService(orderTestRepo);

    const result = await service.verifyMultiple(
      ['cancelled-test', 'valid-test'],
      'lab-1',
      createActor(),
    );

    expect(result).toEqual({ verified: 1, failed: 1 });
    expect(orderTestRepo.save).toHaveBeenCalledWith([valid]);
  });

  it('skips cancelled rows during batch entry', async () => {
    const cancelled = createOrderTest({
      id: 'cancelled-test',
      sample: {
        id: 'sample-1',
        orderId: 'order-1',
        order: { id: 'order-1', labId: 'lab-1', status: OrderStatus.CANCELLED } as Order,
      } as unknown as never,
    });
    const valid = createOrderTest({
      id: 'valid-test',
    });
    const orderTestRepo = {
      find: jest.fn().mockResolvedValue([cancelled, valid]),
      save: jest.fn().mockResolvedValue([valid]),
    };
    const { service } = createService(orderTestRepo);

    const result = await service.batchEnterResults(
      'lab-1',
      createActor(),
      undefined,
      [
        { orderTestId: 'cancelled-test', resultValue: 1.1, resultText: '1.1' },
        { orderTestId: 'valid-test', resultValue: 2.2, resultText: '2.2' },
      ],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('valid-test');
    expect(orderTestRepo.save).toHaveBeenCalledWith([valid]);
  });

  it('rejects verifying a cancelled order result', async () => {
    const orderTest = createOrderTest({
      status: OrderTestStatus.COMPLETED,
      resultValue: 5.1,
      sample: {
        id: 'sample-1',
        orderId: 'order-1',
        order: { id: 'order-1', labId: 'lab-1', status: OrderStatus.CANCELLED } as Order,
      } as unknown as never,
    });
    const orderTestRepo = {
      findOne: jest.fn().mockResolvedValue(orderTest),
      save: jest.fn(),
    };
    const { service } = createService(orderTestRepo);

    await expect(
      service.verifyResult(orderTest.id, 'lab-1', createActor()),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(orderTestRepo.save).not.toHaveBeenCalled();
  });

  it('rejects rejecting a cancelled order result', async () => {
    const orderTest = createOrderTest({
      status: OrderTestStatus.COMPLETED,
      resultValue: 5.1,
      sample: {
        id: 'sample-1',
        orderId: 'order-1',
        order: { id: 'order-1', labId: 'lab-1', status: OrderStatus.CANCELLED } as Order,
      } as unknown as never,
    });
    const orderTestRepo = {
      findOne: jest.fn().mockResolvedValue(orderTest),
      save: jest.fn(),
    };
    const { service } = createService(orderTestRepo);

    await expect(
      service.rejectResult(orderTest.id, 'lab-1', createActor(), 'Need review'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(orderTestRepo.save).not.toHaveBeenCalled();
  });

  it('rejects PDF upload for cancelled orders', async () => {
    const orderTest = createOrderTest({
      test: createTest({
        resultEntryType: 'PDF_UPLOAD',
      }),
      sample: {
        id: 'sample-1',
        orderId: 'order-1',
        order: { id: 'order-1', labId: 'lab-1', status: OrderStatus.CANCELLED } as Order,
      } as unknown as never,
    });
    const orderTestRepo = {
      findOne: jest.fn().mockResolvedValue(orderTest),
      save: jest.fn(),
    };
    const { service } = createService(orderTestRepo);

    await expect(
      service.uploadResultDocument(
        orderTest.id,
        'lab-1',
        createActor(),
        undefined,
        {
          originalname: 'result.pdf',
          mimetype: 'application/pdf',
          buffer: Buffer.from('pdf'),
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(orderTestRepo.save).not.toHaveBeenCalled();
  });

  it('rejects result document access for cancelled orders', async () => {
    const orderTest = createOrderTest({
      resultDocumentStorageKey: 'doc-key',
      resultDocumentFileName: 'result.pdf',
      resultDocumentMimeType: 'application/pdf',
      sample: {
        id: 'sample-1',
        orderId: 'order-1',
        order: { id: 'order-1', labId: 'lab-1', status: OrderStatus.CANCELLED } as Order,
      } as unknown as never,
    });
    const orderTestRepo = {
      findOne: jest.fn().mockResolvedValue(orderTest),
    };
    const { service } = createService(orderTestRepo);

    await expect(
      service.getResultDocumentForLab(orderTest.id, 'lab-1'),
    ).rejects.toThrow('Cancelled orders cannot release results.');
  });

  it('skips panel roots during batch entry and saves child rows only', async () => {
    const panelRoot = createOrderTest({
      id: 'panel-root',
      test: createTest({
        code: 'CBC',
        name: 'Complete Blood Count',
        type: TestType.PANEL,
        allowPanelSaveWithChildDefaults: true,
      }),
    });
    const child = createOrderTest({
      id: 'panel-child',
      parentOrderTestId: panelRoot.id,
      test: createTest({
        code: 'HGB',
        name: 'Hemoglobin',
      }),
    });
    const orderTestRepo = {
      find: jest.fn().mockResolvedValue([panelRoot, child]),
      save: jest.fn().mockResolvedValue([child]),
    };
    const { service, panelStatusService, auditService } = createService(orderTestRepo);

    const result = await service.batchEnterResults(
      'lab-1',
      createActor(),
      undefined,
      [
        {
          orderTestId: panelRoot.id,
          resultText: 'ignored',
        },
        {
          orderTestId: child.id,
          resultValue: 13.4,
          resultText: '13.4',
        },
      ],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(child.id);
    expect(orderTestRepo.save).toHaveBeenCalledTimes(1);
    expect(orderTestRepo.save).toHaveBeenCalledWith([child]);
    expect(panelRoot.status).toBe(OrderTestStatus.PENDING);
    expect(child.status).toBe(OrderTestStatus.COMPLETED);
    expect(panelStatusService.recomputePanelStatus).toHaveBeenCalledWith(panelRoot.id);
    expect(auditService.log).toHaveBeenCalledTimes(1);
  });
});
