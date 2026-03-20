import { BadRequestException } from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service';
import type { CreateLabDto } from './dto/create-lab.dto';
import { AuditAction } from '../entities/audit-log.entity';
import { Lab } from '../entities/lab.entity';
import { UserLabAssignment } from '../entities/user-lab-assignment.entity';
import { Order } from '../entities/order.entity';
import { Department } from '../entities/department.entity';
import { Shift } from '../entities/shift.entity';
import { Pricing } from '../entities/pricing.entity';
import { Test, TestType, TubeType } from '../entities/test.entity';
import { TestComponent } from '../entities/test-component.entity';

function createLabEntity(overrides: Partial<Lab> = {}): Lab {
  return {
    id: 'lab-id',
    code: 'LAB01',
    subdomain: 'lab01',
    name: 'Lab 01',
    timezone: 'UTC',
    isActive: true,
    labelSequenceBy: 'tube_type',
    sequenceResetBy: 'day',
    enableOnlineResults: true,
    reportBannerDataUrl: 'data:image/png;base64,BANNER',
    reportFooterDataUrl: 'data:image/png;base64,FOOTER',
    reportLogoDataUrl: 'data:image/png;base64,LOGO',
    reportWatermarkDataUrl: 'data:image/png;base64,WATERMARK',
    reportStyle: { version: 1 },
    onlineResultWatermarkDataUrl: 'data:image/png;base64,ONLINE',
    onlineResultWatermarkText: 'ONLINE',
    printMethod: 'browser',
    receiptPrinterName: null,
    labelsPrinterName: null,
    reportPrinterName: null,
    uiTestGroups: [{ id: 'group-1', name: 'Chemistry', testIds: ['test-1'] }],
    referringDoctors: ['Dr A'],
    dashboardAnnouncementText: 'Heads up',
    createdAt: new Date('2026-02-01T10:00:00.000Z'),
    updatedAt: new Date('2026-02-01T10:00:00.000Z'),
    userAssignments: [],
    shifts: [],
    departments: [],
    tests: [],
    ...overrides,
  } as Lab;
}

function createTestEntity(overrides: Partial<Test> = {}): Test {
  return {
    id: 'test-id',
    labId: 'lab-id',
    lab: undefined as never,
    code: 'TEST',
    name: 'Test',
    abbreviation: null,
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
    allowPanelSaveWithChildDefaults: false,
    cultureConfig: null,
    numericAgeRanges: null,
    description: null,
    childTestIds: null,
    parameterDefinitions: null,
    isActive: true,
    sortOrder: 0,
    expectedCompletionMinutes: null,
    createdAt: new Date('2026-02-01T10:00:00.000Z'),
    updatedAt: new Date('2026-02-01T10:00:00.000Z'),
    orderTests: [],
    ...overrides,
  } as Test;
}

function createCountQueryBuilder<T>(rows: T) {
  return {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
}

function createListLabsService(lab: Lab) {
  const userCountsQb = createCountQueryBuilder([{ labId: lab.id, usersCount: '3' }]);
  const orderCountsQb = createCountQueryBuilder([{ labId: lab.id, orders30dCount: '12' }]);
  const labRepo = {
    find: jest.fn().mockResolvedValue([lab]),
    findOne: jest.fn().mockResolvedValue(lab),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Lab) return labRepo;
      if (entity === UserLabAssignment) {
        return { createQueryBuilder: jest.fn().mockReturnValue(userCountsQb) };
      }
      if (entity === Order) {
        return { createQueryBuilder: jest.fn().mockReturnValue(orderCountsQb) };
      }
      return {};
    }),
  };
  const withPlatformAdminContext = jest.fn(async (fn: (manager: unknown) => Promise<unknown>) =>
    fn(manager),
  );
  const auditLog = jest.fn().mockResolvedValue({ id: 'audit-id' });

  const service = new PlatformAdminService(
    {
      withPlatformAdminContext,
    } as never,
    {} as never,
    { log: auditLog } as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return {
    service,
    withPlatformAdminContext,
    manager,
    labRepo,
  };
}

function createTransferService() {
  const sourceLab = createLabEntity({
    id: '11111111-1111-4111-8111-111111111111',
    code: 'SRC',
    name: 'Source Lab',
  });
  const targetLab = createLabEntity({
    id: '22222222-2222-4222-8222-222222222222',
    code: 'TGT',
    name: 'Target Lab',
  });

  const sourceTests = [
    createTestEntity({
      id: 'source-cbc',
      labId: sourceLab.id,
      code: 'CBC',
      name: 'Complete Blood Count',
      type: TestType.PANEL,
      departmentId: 'source-dept-hem',
      category: 'Hematology',
    }),
    createTestEntity({
      id: 'source-glu',
      labId: sourceLab.id,
      code: 'GLU',
      name: 'Glucose',
      departmentId: 'source-dept-chem',
      category: 'Chemistry',
      normalMin: 70,
      normalMax: 100,
      expectedCompletionMinutes: 30,
    }),
    createTestEntity({
      id: 'source-wbc',
      labId: sourceLab.id,
      code: 'WBC',
      name: 'White Blood Cells',
      departmentId: 'source-dept-hem',
      category: 'Hematology',
      normalMin: 4,
      normalMax: 11,
    }),
  ];

  const targetTests: Test[] = [
    createTestEntity({
      id: 'target-glu',
      labId: targetLab.id,
      code: 'GLU',
      name: 'Old Glucose',
      category: 'Legacy',
    }),
  ];

  const sourceDepartments: Department[] = [
    { id: 'source-dept-chem', labId: sourceLab.id, code: 'CHEM', name: 'Chemistry', lab: sourceLab } as Department,
    { id: 'source-dept-hem', labId: sourceLab.id, code: 'HEM', name: 'Hematology', lab: sourceLab } as Department,
  ];
  const targetDepartments: Department[] = [
    { id: 'target-dept-chem', labId: targetLab.id, code: 'CHEM', name: 'Chemistry', lab: targetLab } as Department,
  ];
  const targetShifts: Shift[] = [
    {
      id: 'target-shift-day',
      labId: targetLab.id,
      code: 'DAY',
      name: 'Day',
      startTime: '08:00',
      endTime: '16:00',
      isEmergency: false,
      lab: targetLab,
      userAssignments: [],
    } as Shift,
  ];

  const sourceComponents: TestComponent[] = [
    {
      panelTestId: 'source-cbc',
      childTestId: 'source-wbc',
      required: true,
      sortOrder: 1,
      reportSection: 'Basic',
      reportGroup: 'WBC',
      effectiveFrom: null,
      effectiveTo: null,
      createdAt: new Date('2026-02-01T10:00:00.000Z'),
      updatedAt: new Date('2026-02-01T10:00:00.000Z'),
      panelTest: sourceTests[0],
      childTest: sourceTests[2],
    } as TestComponent,
  ];

  const sourcePricingRows: Pricing[] = [
    {
      id: 'pricing-glu-default',
      labId: sourceLab.id,
      testId: 'source-glu',
      shiftId: null,
      patientType: null,
      price: 1500,
      isActive: true,
      createdAt: new Date('2026-02-01T10:00:00.000Z'),
      updatedAt: new Date('2026-02-01T10:00:00.000Z'),
      lab: sourceLab,
      test: sourceTests[1],
      shift: null,
    } as Pricing,
    {
      id: 'pricing-glu-day',
      labId: sourceLab.id,
      testId: 'source-glu',
      shiftId: 'source-shift-day',
      patientType: null,
      price: 1700,
      isActive: true,
      createdAt: new Date('2026-02-01T10:00:00.000Z'),
      updatedAt: new Date('2026-02-01T10:00:00.000Z'),
      lab: sourceLab,
      test: sourceTests[1],
      shift: {
        id: 'source-shift-day',
        labId: sourceLab.id,
        code: 'DAY',
        name: 'Day',
        startTime: '08:00',
        endTime: '16:00',
        isEmergency: false,
        lab: sourceLab,
        userAssignments: [],
      } as Shift,
    } as Pricing,
    {
      id: 'pricing-glu-night',
      labId: sourceLab.id,
      testId: 'source-glu',
      shiftId: 'source-shift-night',
      patientType: null,
      price: 1900,
      isActive: true,
      createdAt: new Date('2026-02-01T10:00:00.000Z'),
      updatedAt: new Date('2026-02-01T10:00:00.000Z'),
      lab: sourceLab,
      test: sourceTests[1],
      shift: {
        id: 'source-shift-night',
        labId: sourceLab.id,
        code: 'NIGHT',
        name: 'Night',
        startTime: '16:00',
        endTime: '23:00',
        isEmergency: false,
        lab: sourceLab,
        userAssignments: [],
      } as Shift,
    } as Pricing,
    {
      id: 'pricing-wbc-default',
      labId: sourceLab.id,
      testId: 'source-wbc',
      shiftId: null,
      patientType: null,
      price: 1200,
      isActive: true,
      createdAt: new Date('2026-02-01T10:00:00.000Z'),
      updatedAt: new Date('2026-02-01T10:00:00.000Z'),
      lab: sourceLab,
      test: sourceTests[2],
      shift: null,
    } as Pricing,
    {
      id: 'pricing-cbc-default',
      labId: sourceLab.id,
      testId: 'source-cbc',
      shiftId: null,
      patientType: null,
      price: 3200,
      isActive: true,
      createdAt: new Date('2026-02-01T10:00:00.000Z'),
      updatedAt: new Date('2026-02-01T10:00:00.000Z'),
      lab: sourceLab,
      test: sourceTests[0],
      shift: null,
    } as Pricing,
  ];

  let createdTestCounter = 0;
  const labRepo = {
    findOne: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === sourceLab.id) return sourceLab;
      if (where.id === targetLab.id) return targetLab;
      return null;
    }),
  };
  const testRepo = {
    find: jest.fn().mockImplementation(async ({ where }: { where: { labId: string } }) => {
      if (where.labId === sourceLab.id) return sourceTests;
      if (where.labId === targetLab.id) return targetTests;
      return [];
    }),
    create: jest.fn((payload: unknown) => payload),
    save: jest.fn().mockImplementation(async (entity: Partial<Test>) => {
      const saved = {
        ...entity,
        id: entity.id ?? `created-test-${++createdTestCounter}`,
      } as Test;
      const index = targetTests.findIndex((test) => test.id === saved.id);
      if (index >= 0) targetTests[index] = saved;
      else {
        const existingIndex = targetTests.findIndex((test) => test.code === saved.code);
        if (existingIndex >= 0) targetTests[existingIndex] = saved;
        else targetTests.push(saved);
      }
      return saved;
    }),
  };
  const pricingRepo = {
    find: jest.fn().mockImplementation(async ({ where }: { where: { labId: string } }) => {
      if (where.labId === sourceLab.id) return sourcePricingRows;
      return [];
    }),
    create: jest.fn((payload: unknown) => payload),
    save: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const testComponentRepo = {
    find: jest.fn().mockResolvedValue(sourceComponents),
    create: jest.fn((payload: unknown) => payload),
    save: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const departmentRepo = {
    find: jest.fn().mockImplementation(async ({ where }: { where: { labId: string } }) => {
      if (where.labId === sourceLab.id) return sourceDepartments;
      if (where.labId === targetLab.id) return targetDepartments;
      return [];
    }),
  };
  const shiftRepo = {
    find: jest.fn().mockImplementation(async ({ where }: { where: { labId: string } }) => {
      if (where.labId === targetLab.id) return targetShifts;
      return [];
    }),
  };

  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Lab) return labRepo;
      if (entity === Test) return testRepo;
      if (entity === Pricing) return pricingRepo;
      if (entity === TestComponent) return testComponentRepo;
      if (entity === Department) return departmentRepo;
      if (entity === Shift) return shiftRepo;
      return {};
    }),
  };
  const withPlatformAdminContext = jest.fn(async (fn: (manager: unknown) => Promise<unknown>) =>
    fn(manager),
  );
  const auditLog = jest.fn().mockResolvedValue({ id: 'audit-id' });
  const service = new PlatformAdminService(
    { withPlatformAdminContext } as never,
    {} as never,
    { log: auditLog } as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return {
    service,
    auditLog,
    testRepo,
    pricingRepo,
    testComponentRepo,
    targetTests,
  };
}

describe('PlatformAdminService', () => {
  it('requires explicit labId for drill-down orders endpoint', async () => {
    const service = new PlatformAdminService(
      {
        withPlatformAdminContext: jest.fn(),
      } as never,
      {} as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.listOrdersByLab({ labId: '' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes code/subdomain when creating lab', async () => {
    const save = jest.fn().mockResolvedValue({
      id: 'lab-id',
      code: 'LAB02',
      name: 'Lab 02',
      subdomain: 'lab02',
      timezone: 'Asia/Baghdad',
    });
    const create = jest.fn((payload: unknown) => payload);
    const findOne = jest.fn().mockResolvedValue(null);
    const manager = {
      getRepository: () => ({ save, create, findOne }),
    };

    const withPlatformAdminContext = jest.fn(async (fn: (manager: unknown) => Promise<unknown>) =>
      fn(manager),
    );
    const auditLog = jest.fn().mockResolvedValue({ id: 'audit-id' });

    const service = new PlatformAdminService(
      {
        withPlatformAdminContext,
      } as never,
      {} as never,
      { log: auditLog } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const input: CreateLabDto = {
      code: 'lab02',
      name: 'Lab 02',
    };
    await service.createLab(input, {
      platformUserId: 'platform-user-id',
      role: 'SUPER_ADMIN',
    });

    expect(findOne).toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'LAB02',
        subdomain: 'lab02',
        timezone: 'Asia/Baghdad',
      }),
    );
    expect(save).toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.PLATFORM_LAB_CREATE,
      }),
      manager,
    );
  });

  it('uses transaction manager for lab update audit logging', async () => {
    const existingLab = {
      id: 'lab-id',
      code: 'LAB02',
      name: 'Old Name',
      subdomain: 'lab02',
      timezone: 'UTC',
    };
    const savedLab = {
      ...existingLab,
      name: 'New Name',
    };
    const findOne = jest.fn().mockResolvedValue(existingLab);
    const save = jest.fn().mockResolvedValue(savedLab);
    const manager = {
      getRepository: () => ({ findOne, save }),
    };
    const withPlatformAdminContext = jest.fn(async (fn: (manager: unknown) => Promise<unknown>) =>
      fn(manager),
    );
    const auditLog = jest.fn().mockResolvedValue({ id: 'audit-id' });

    const service = new PlatformAdminService(
      {
        withPlatformAdminContext,
      } as never,
      {} as never,
      { log: auditLog } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.updateLab('lab-id', { name: 'New Name' }, {
      platformUserId: 'platform-user-id',
      role: 'SUPER_ADMIN',
    });

    expect(save).toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.PLATFORM_LAB_UPDATE,
      }),
      manager,
    );
  });

  it('uses transaction manager for lab status audit logging', async () => {
    const existingLab = {
      id: 'lab-id',
      code: 'LAB02',
      name: 'Lab 02',
      isActive: true,
    };
    const updatedLab = {
      ...existingLab,
      isActive: false,
    };
    const findOne = jest.fn().mockResolvedValue(existingLab);
    const save = jest.fn().mockResolvedValue(updatedLab);
    const manager = {
      getRepository: () => ({ findOne, save }),
    };
    const withPlatformAdminContext = jest.fn(async (fn: (manager: unknown) => Promise<unknown>) =>
      fn(manager),
    );
    const auditLog = jest.fn().mockResolvedValue({ id: 'audit-id' });

    const service = new PlatformAdminService(
      {
        withPlatformAdminContext,
      } as never,
      {} as never,
      { log: auditLog } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.setLabStatus('lab-id', { isActive: false, reason: 'Maintenance window' }, {
      platformUserId: 'platform-user-id',
      role: 'SUPER_ADMIN',
    });

    expect(save).toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.PLATFORM_LAB_STATUS_CHANGE,
      }),
      manager,
    );
  });

  it('logs global announcement reads without sending a non-uuid entityId to audit logs', async () => {
    const manager = {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(null),
      }),
    };
    const withPlatformAdminContext = jest.fn(async (fn: (manager: unknown) => Promise<unknown>) =>
      fn(manager),
    );
    const auditLog = jest.fn().mockResolvedValue({ id: 'audit-id' });

    const service = new PlatformAdminService(
      {
        withPlatformAdminContext,
      } as never,
      {} as never,
      { log: auditLog } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.getGlobalDashboardAnnouncement({
      platformUserId: 'fbe7e604-d95d-45eb-8db7-d917fa78efaa',
      role: 'SUPER_ADMIN',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.PLATFORM_SENSITIVE_READ,
        entityType: 'platform_setting',
        entityId: null,
        newValues: {
          entityReference: 'dashboard.announcement.all_labs',
        },
        description: 'Viewed global dashboard announcement',
      }),
      undefined,
    );
  });

  it('returns compact lab list items without report or settings blobs', async () => {
    const lab = createLabEntity();
    const { service } = createListLabsService(lab);

    const result = await service.listLabs();

    expect(result).toEqual([
      expect.objectContaining({
        id: 'lab-id',
        code: 'LAB01',
        subdomain: 'lab01',
        name: 'Lab 01',
        timezone: 'UTC',
        isActive: true,
        usersCount: 3,
        orders30dCount: 12,
      }),
    ]);
    expect(Object.prototype.hasOwnProperty.call(result[0], 'reportBannerDataUrl')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result[0], 'onlineResultWatermarkDataUrl')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result[0], 'reportStyle')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result[0], 'uiTestGroups')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result[0], 'referringDoctors')).toBe(false);
  });

  it('returns compact lab detail without report or settings blobs', async () => {
    const lab = createLabEntity();
    const { service } = createListLabsService(lab);

    const result = await service.getLab('lab-id');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'lab-id',
        code: 'LAB01',
        name: 'Lab 01',
        usersCount: 3,
        orders30dCount: 12,
      }),
    );
    expect(Object.prototype.hasOwnProperty.call(result, 'reportBannerDataUrl')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, 'onlineResultWatermarkDataUrl')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, 'reportStyle')).toBe(false);
  });

  it('returns compact admin settings summary from GET and full design payload from PATCH', async () => {
    const fullSettings = {
      id: 'lab-id',
      code: 'LAB01',
      name: 'Lab 01',
      reportDesignFingerprint: 'abc123',
      dashboardAnnouncementText: 'Heads up',
      labelSequenceBy: 'department',
      sequenceResetBy: 'shift',
      enableOnlineResults: true,
      onlineResultWatermarkDataUrl: 'data:image/png;base64,ONLINE',
      printing: {
        mode: 'direct_gateway',
        receiptPrinterName: 'Receipt',
        labelsPrinterName: 'Labels',
        reportPrinterName: 'Reports',
      },
      reportBranding: {
        bannerDataUrl: 'data:image/png;base64,BANNER',
        footerDataUrl: null,
        logoDataUrl: 'data:image/png;base64,LOGO',
        watermarkDataUrl: null,
      },
      reportStyle: { version: 1 },
      uiTestGroups: [{ id: 'group-1', name: 'Chemistry', testIds: ['test-1'] }],
      referringDoctors: ['Dr A'],
    };
    const service = new PlatformAdminService(
      { withPlatformAdminContext: jest.fn() } as never,
      {
        getLabSettings: jest.fn().mockResolvedValue(fullSettings),
        updateLabSettings: jest.fn().mockResolvedValue(fullSettings),
      } as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const summary = await service.getLabSettings('lab-id');
    const updated = await service.updateLabSettings('lab-id', {
      dashboardAnnouncementText: 'Heads up',
    });

    expect(summary).toEqual(
      expect.objectContaining({
        reportDesignFingerprint: 'abc123',
        labelSequenceBy: 'department',
        sequenceResetBy: 'shift',
        hasOnlineResultWatermarkImage: true,
        hasReportBanner: true,
        hasReportFooter: false,
        hasReportLogo: true,
        hasReportWatermark: false,
      }),
    );
    expect(updated).toEqual(
      expect.objectContaining({
        ...summary,
        reportBranding: fullSettings.reportBranding,
        reportStyle: fullSettings.reportStyle,
        onlineResultWatermarkDataUrl: fullSettings.onlineResultWatermarkDataUrl,
      }),
    );
    expect(Object.prototype.hasOwnProperty.call(summary, 'onlineResultWatermarkDataUrl')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(summary, 'onlineResultWatermarkText')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(summary, 'reportBranding')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(summary, 'reportStyle')).toBe(false);
    expect(updated.onlineResultWatermarkDataUrl).toBe(fullSettings.onlineResultWatermarkDataUrl);
    expect(updated.reportBranding).toEqual(fullSettings.reportBranding);
    expect(updated.reportStyle).toEqual(fullSettings.reportStyle);
  });

  it('returns full report design payload from the dedicated endpoint', async () => {
    const fullSettings = {
      id: 'lab-id',
      code: 'LAB01',
      name: 'Lab 01',
      reportDesignFingerprint: 'abc123',
      dashboardAnnouncementText: null,
      labelSequenceBy: 'tube_type',
      sequenceResetBy: 'day',
      enableOnlineResults: true,
      onlineResultWatermarkDataUrl: 'data:image/png;base64,ONLINE',
      printing: {
        mode: 'browser',
        receiptPrinterName: null,
        labelsPrinterName: null,
        reportPrinterName: null,
      },
      reportBranding: {
        bannerDataUrl: 'data:image/png;base64,BANNER',
        footerDataUrl: 'data:image/png;base64,FOOTER',
        logoDataUrl: 'data:image/png;base64,LOGO',
        watermarkDataUrl: 'data:image/png;base64,WATERMARK',
      },
      reportStyle: { version: 1, patientInfo: {}, resultsTable: {}, pageLayout: {} },
      uiTestGroups: [],
      referringDoctors: [],
    };
    const service = new PlatformAdminService(
      { withPlatformAdminContext: jest.fn() } as never,
      {
        getLabSettings: jest.fn().mockResolvedValue(fullSettings),
      } as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.getLabReportDesign('lab-id');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'lab-id',
        code: 'LAB01',
        reportDesignFingerprint: 'abc123',
        onlineResultWatermarkDataUrl: 'data:image/png;base64,ONLINE',
        reportBranding: fullSettings.reportBranding,
        reportStyle: fullSettings.reportStyle,
      }),
    );
    expect(Object.prototype.hasOwnProperty.call(result, 'onlineResultWatermarkText')).toBe(false);
  });

  it('surfaces actual access and refresh token lifetimes in platform settings overview', async () => {
    const service = new PlatformAdminService(
      {
        withPlatformAdminContext: jest.fn(async (fn: (manager: unknown) => Promise<unknown>) =>
          fn({
            query: jest
              .fn()
              .mockResolvedValueOnce([{ count: 1 }])
              .mockResolvedValueOnce([{ count: 2 }]),
          }),
        ),
      } as never,
      {} as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const overview = await service.getPlatformSettingsOverview();

    expect(overview.securityPolicy.accessTokenLifetimeMinutes).toBeGreaterThan(0);
    expect(overview.securityPolicy.refreshTokenLifetimeDays).toBeGreaterThan(0);
    expect(overview.securityPolicy.sessionTimeoutMinutes).toBe(
      overview.securityPolicy.accessTokenLifetimeMinutes,
    );
  });

  it('rotates access and refresh tokens when starting impersonation', async () => {
    const lab = createLabEntity();
    const manager = {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(lab),
      }),
    };
    const withPlatformAdminContext = jest.fn(async (fn: (manager: unknown) => Promise<unknown>) =>
      fn(manager),
    );
    const auditLog = jest.fn().mockResolvedValue({ id: 'audit-id' });
    const reissueSession = jest.fn().mockResolvedValue({
      accessToken: 'access-impersonating',
      refreshToken: 'refresh-impersonating',
    });

    const service = new PlatformAdminService(
      {
        withPlatformAdminContext,
      } as never,
      {} as never,
      { log: auditLog } as never,
      {} as never,
      { reissueSession } as never,
      {} as never,
    );

    const result = await service.startImpersonation(
      {
        labId: lab.id,
        reason: 'Investigating workflow',
        refreshToken: 'current-refresh',
      },
      {
        platformUserId: 'platform-user-id',
        role: 'SUPER_ADMIN',
        impersonatedLabId: null,
      },
    );

    expect(reissueSession).toHaveBeenCalledWith(
      'current-refresh',
      {
        platformUserId: 'platform-user-id',
        impersonatedLabId: lab.id,
      },
      {
        ipAddress: null,
        userAgent: null,
      },
    );
    expect(result.refreshToken).toBe('refresh-impersonating');
  });

  it('rotates access and refresh tokens when stopping impersonation', async () => {
    const reissueSession = jest.fn().mockResolvedValue({
      accessToken: 'access-normal',
      refreshToken: 'refresh-normal',
    });
    const auditLog = jest.fn().mockResolvedValue({ id: 'audit-id' });
    const service = new PlatformAdminService(
      {
        withPlatformAdminContext: jest.fn(),
      } as never,
      {} as never,
      { log: auditLog } as never,
      {} as never,
      { reissueSession } as never,
      {} as never,
    );

    const result = await service.stopImpersonation(
      { refreshToken: 'current-refresh' },
      {
        platformUserId: 'platform-user-id',
        role: 'SUPER_ADMIN',
        impersonatedLabId: 'lab-id',
      },
    );

    expect(reissueSession).toHaveBeenCalledWith(
      'current-refresh',
      {
        platformUserId: 'platform-user-id',
        impersonatedLabId: null,
      },
      {
        ipAddress: null,
        userAgent: null,
      },
    );
    expect(result.refreshToken).toBe('refresh-normal');
  });

  it('previews test transfer without writing and reports mapping warnings', async () => {
    const { service, auditLog, testRepo, pricingRepo, testComponentRepo } = createTransferService();

    const result = await service.transferLabTests(
      '22222222-2222-4222-8222-222222222222',
      { sourceLabId: '11111111-1111-4111-8111-111111111111', dryRun: true },
      {
        platformUserId: 'platform-user-id',
        role: 'SUPER_ADMIN',
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        dryRun: true,
        totalSourceTests: 3,
        createCount: 2,
        updateCount: 1,
        pricingRowsCopied: 4,
        pricingRowsSkipped: 1,
      }),
    );
    expect(result.unmatchedDepartments).toEqual([
      { testCode: 'CBC', departmentCode: 'HEM' },
      { testCode: 'WBC', departmentCode: 'HEM' },
    ]);
    expect(result.unmatchedShiftPrices).toEqual([
      { testCode: 'GLU', shiftCode: 'NIGHT' },
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('no department'),
        expect.stringContaining('shift-specific pricing rows were skipped'),
      ]),
    );
    expect(testRepo.save).not.toHaveBeenCalled();
    expect(pricingRepo.delete).not.toHaveBeenCalled();
    expect(testComponentRepo.delete).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.PLATFORM_TEST_TRANSFER,
        labId: '22222222-2222-4222-8222-222222222222',
        entityId: '22222222-2222-4222-8222-222222222222',
        newValues: expect.objectContaining({
          sourceLabId: '11111111-1111-4111-8111-111111111111',
          targetLabId: '22222222-2222-4222-8222-222222222222',
          dryRun: true,
          createdCount: 2,
          updatedCount: 1,
          unmatchedDepartmentCount: 2,
          unmatchedShiftPriceCount: 1,
        }),
      }),
      expect.anything(),
    );
  });

  it('applies test transfer by upserting tests, rebuilding panels, and syncing pricing', async () => {
    const { service, testRepo, pricingRepo, testComponentRepo, targetTests } = createTransferService();

    const result = await service.transferLabTests(
      '22222222-2222-4222-8222-222222222222',
      { sourceLabId: '11111111-1111-4111-8111-111111111111', dryRun: false },
      {
        platformUserId: 'platform-user-id',
        role: 'SUPER_ADMIN',
      },
    );

    expect(result.dryRun).toBe(false);
    expect(testRepo.save).toHaveBeenCalledTimes(3);
    expect(pricingRepo.delete).toHaveBeenCalledTimes(3);
    expect(pricingRepo.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ testId: 'target-glu', shiftId: null, price: 1500 }),
        expect.objectContaining({ testId: 'target-glu', shiftId: 'target-shift-day', price: 1700 }),
      ]),
    );

    const targetCbc = targetTests.find((test) => test.code === 'CBC');
    const targetWbc = targetTests.find((test) => test.code === 'WBC');
    expect(targetCbc).toBeDefined();
    expect(targetWbc).toBeDefined();
    expect(testComponentRepo.delete).toHaveBeenCalled();
    expect(testComponentRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        panelTestId: targetCbc?.id,
        childTestId: targetWbc?.id,
        reportSection: 'Basic',
        reportGroup: 'WBC',
      }),
    ]);
  });
});
