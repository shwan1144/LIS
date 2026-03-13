import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { AuditActorType } from '../entities/audit-log.entity';
import { Order } from '../entities/order.entity';
import { Antibiotic } from '../entities/antibiotic.entity';
import { OrderTest, OrderTestStatus } from '../entities/order-test.entity';
import { Lab } from '../entities/lab.entity';
import { TestAntibiotic } from '../entities/test-antibiotic.entity';
import { Test, TestType, TubeType } from '../entities/test.entity';
import { Department } from '../entities/department.entity';
import { UserDepartmentAssignment } from '../entities/user-department-assignment.entity';
import { WorklistService } from './worklist.service';
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

  const service = new WorklistService(
    orderTestRepo as unknown as Repository<OrderTest>,
    {} as Repository<Order>,
    {} as Repository<Test>,
    {} as Repository<TestAntibiotic>,
    (options?.antibioticRepo ?? {}) as unknown as Repository<Antibiotic>,
    (options?.labRepo ?? {}) as unknown as Repository<Lab>,
    {} as Repository<UserDepartmentAssignment>,
    {} as Repository<Department>,
    panelStatusService as never,
    auditService as never,
  );

  (service as any).syncOrderStatus = jest.fn().mockResolvedValue(undefined);

  return {
    service,
    panelStatusService,
    auditService,
  };
}

describe('WorklistService result guards', () => {
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
    const { service, auditService } = createService(orderTestRepo);

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
