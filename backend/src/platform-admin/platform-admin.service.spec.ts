import { BadRequestException } from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service';
import type { CreateLabDto } from './dto/create-lab.dto';
import { AuditAction } from '../entities/audit-log.entity';

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
});
