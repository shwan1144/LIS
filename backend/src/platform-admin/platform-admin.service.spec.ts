import { BadRequestException } from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service';
import type { CreateLabDto } from './dto/create-lab.dto';
import { AuditAction } from '../entities/audit-log.entity';
import { Lab } from '../entities/lab.entity';
import { UserLabAssignment } from '../entities/user-lab-assignment.entity';
import { Order } from '../entities/order.entity';

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

  it('returns compact admin settings summary with asset flags and no data URLs', async () => {
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
      onlineResultWatermarkText: 'ONLINE',
      printing: {
        mode: 'direct_qz',
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
    expect(updated).toEqual(summary);
    expect(Object.prototype.hasOwnProperty.call(summary, 'onlineResultWatermarkDataUrl')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(summary, 'reportBranding')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(summary, 'reportStyle')).toBe(false);
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
      onlineResultWatermarkText: 'ONLINE',
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
        onlineResultWatermarkText: 'ONLINE',
        reportBranding: fullSettings.reportBranding,
        reportStyle: fullSettings.reportStyle,
      }),
    );
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
});
