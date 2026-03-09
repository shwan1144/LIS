import { BadRequestException } from '@nestjs/common';
import { LabApiService } from './lab-api.service';
import { OrderTest, OrderTestStatus } from '../entities/order-test.entity';
import { Test, TestType, TubeType } from '../entities/test.entity';
import { AuditActorType } from '../entities/audit-log.entity';

function createOrderTest(): OrderTest {
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
    sample: null as never,
    lab: null,
    test: {
      id: 'test-1',
      labId: 'lab-1',
      lab: null as never,
      code: 'GLU',
      name: 'Glucose',
      abbreviation: 'GLU',
      type: TestType.SINGLE,
      tubeType: TubeType.SERUM,
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
    } as unknown as Test,
    parentOrderTest: null,
    childOrderTests: [],
  } as unknown as OrderTest;
}

describe('LabApiService result guards', () => {
  it('rejects blank legacy result entry payloads', async () => {
    const orderTest = createOrderTest();
    const orderTestRepo = {
      findOne: jest.fn().mockResolvedValue(orderTest),
      save: jest.fn(),
    };
    const resultRepo = {
      create: jest.fn(),
      save: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === OrderTest) {
          return orderTestRepo;
        }
        return resultRepo;
      }),
    };
    const rlsSessionService = {
      withLabContext: jest.fn(async (_labId: string, fn: (manager: unknown) => Promise<unknown>) =>
        fn(manager),
      ),
    };
    const auditService = {
      log: jest.fn(),
    };
    const service = new LabApiService(
      rlsSessionService as never,
      auditService as never,
    );

    await expect(
      service.enterResult(
        'lab-1',
        {
          orderTestId: orderTest.id,
          value: '   ',
        },
        {
          userId: 'user-1',
          actorType: AuditActorType.LAB_USER,
          actorId: 'user-1',
          isImpersonation: false,
          platformUserId: null,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(orderTestRepo.save).not.toHaveBeenCalled();
    expect(resultRepo.save).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });
});
