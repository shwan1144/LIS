import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Lab } from '../entities/lab.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { RlsSessionService } from '../database/rls-session.service';
import { CreateLabDto } from './dto/create-lab.dto';
import { SettingsService } from '../settings/settings.service';
import { User } from '../entities/user.entity';
import { Shift } from '../entities/shift.entity';
import { Department } from '../entities/department.entity';
import { UserLabAssignment } from '../entities/user-lab-assignment.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditActorType } from '../entities/audit-log.entity';
import { OrderTest, OrderTestStatus } from '../entities/order-test.entity';
import { Patient } from '../entities/patient.entity';
import { ReportsService } from '../reports/reports.service';
import { EntityManager, In, SelectQueryBuilder } from 'typeorm';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { AuthService } from '../auth/auth.service';

export interface PlatformActorContext {
  platformUserId: string;
  role: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export type AdminLabListItem = Lab & {
  usersCount: number;
  orders30dCount: number;
};

export interface AdminSystemHealth {
  status: 'ok' | 'degraded';
  checkedAt: string;
  uptimeSeconds: number;
  environment: string;
  db: {
    connected: boolean;
    serverTime: string | null;
    error: string | null;
  };
}

export interface AdminPlatformSettingsOverview {
  branding: {
    logoUploadEnabled: boolean;
    themeColor: string;
  };
  securityPolicy: {
    sessionTimeoutMinutes: number;
    passwordMinLength: number;
    requireStrongPassword: boolean;
  };
  mfa: {
    mode: 'OPTIONAL' | 'REQUIRED';
    enabledAccounts: number;
    totalAccounts: number;
  };
}

export interface AdminOrderListItem {
  id: string;
  labId: string;
  labCode: string | null;
  labName: string | null;
  orderNumber: string | null;
  status: OrderStatus;
  registeredAt: Date;
  patientId: string;
  patientName: string | null;
  patientPhone: string | null;
  paymentStatus: string | null;
  finalAmount: number | null;
  testsCount: number;
  verifiedTestsCount: number;
  hasCriticalFlag: boolean;
  barcode: string | null;
}

export interface AdminDashboardTrendPoint {
  date: string;
  ordersCount: number;
}

export interface AdminDashboardTopTest {
  testId: string;
  testCode: string;
  testName: string;
  ordersCount: number;
  verifiedCount: number;
}

export interface AdminDashboardLabActivity {
  labId: string;
  labCode: string;
  labName: string;
  ordersCount: number;
  totalTestsCount: number;
  verifiedTestsCount: number;
  pendingResultsCount: number;
  completionRate: number;
}

export interface AdminDashboardSummary {
  labsCount: number;
  activeLabsCount: number;
  totalPatientsCount: number;
  ordersCount: number;
  ordersTodayCount: number;
  pendingResultsCount: number;
  completedTodayCount: number;
  dateRange: {
    from: string;
    to: string;
  };
  ordersTrend: AdminDashboardTrendPoint[];
  topTests: AdminDashboardTopTest[];
  ordersByLab: AdminDashboardLabActivity[];
  alerts: {
    inactiveLabs: Array<{
      labId: string;
      labCode: string;
      labName: string;
      lastOrderAt: string | null;
      daysSinceLastOrder: number | null;
    }>;
    highPendingLabs: Array<{
      labId: string;
      labCode: string;
      labName: string;
      pendingResultsCount: number;
      totalTestsCount: number;
      pendingRate: number;
    }>;
    failedLoginsLast24h: {
      totalCount: number;
      platformCount: number;
      labCount: number;
      byLab: Array<{
        labId: string;
        labCode: string;
        labName: string;
        failedCount: number;
      }>;
    };
  };
}

export interface AdminAuditLogFilters {
  labId?: string;
  actorType?: string;
  action?: string;
  entityType?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AdminImpersonationStatus {
  active: boolean;
  labId: string | null;
  lab: {
    id: string;
    code: string;
    name: string;
    subdomain: string | null;
    isActive: boolean;
  } | null;
}

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly rlsSessionService: RlsSessionService,
    private readonly settingsService: SettingsService,
    private readonly auditService: AuditService,
    private readonly reportsService: ReportsService,
    private readonly adminAuthService: AdminAuthService,
    private readonly authService: AuthService,
  ) {}

  async listLabs(): Promise<AdminLabListItem[]> {
    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const labs = await manager.getRepository(Lab).find({
        order: { name: 'ASC' },
      });
      return this.toAdminLabListItems(manager, labs);
    });
  }

  async listLabsPaged(params: {
    q?: string;
    status?: string;
    page?: number;
    size?: number;
  }): Promise<{ items: AdminLabListItem[]; total: number; page: number; size: number; totalPages: number }> {
    const page = Math.max(1, params.page ?? 1);
    const size = Math.min(200, Math.max(1, params.size ?? 25));
    const skip = (page - 1) * size;
    const status = params.status?.trim().toLowerCase();

    if (status && !['all', 'active', 'disabled'].includes(status)) {
      throw new BadRequestException('Invalid status');
    }

    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const qb = manager.getRepository(Lab).createQueryBuilder('lab');

      if (status === 'active') {
        qb.andWhere('lab.isActive = true');
      } else if (status === 'disabled') {
        qb.andWhere('lab.isActive = false');
      }

      if (params.q?.trim()) {
        const q = `%${params.q.trim()}%`;
        qb.andWhere(
          `(lab.name ILIKE :q
            OR lab.code ILIKE :q
            OR COALESCE(lab.subdomain, '') ILIKE :q
            OR COALESCE(lab.timezone, '') ILIKE :q)`,
          { q },
        );
      }

      const total = await qb.clone().getCount();
      const labs = await qb
        .orderBy('lab.name', 'ASC')
        .addOrderBy('lab.code', 'ASC')
        .skip(skip)
        .take(size)
        .getMany();

      const items = await this.toAdminLabListItems(manager, labs);

      return {
        items,
        total,
        page,
        size,
        totalPages: Math.ceil(total / size),
      };
    });
  }

  async getLab(labId: string, actor?: PlatformActorContext): Promise<AdminLabListItem> {
    const labs = await this.listLabs();
    const lab = labs.find((item) => item.id === labId);
    if (!lab) {
      throw new NotFoundException('Lab not found');
    }
    await this.logPlatformSensitiveRead(actor, {
      labId,
      entityType: 'lab',
      entityId: labId,
      description: `Viewed lab details for ${lab.name} (${lab.code})`,
    });
    return lab;
  }

  async createLab(dto: CreateLabDto, actor?: PlatformActorContext): Promise<Lab> {
    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const labRepo = manager.getRepository(Lab);

      const code = dto.code.trim().toUpperCase();
      const name = dto.name.trim();
      const subdomain = (dto.subdomain?.trim().toLowerCase() || this.toSubdomainFromCode(code));
      const timezone = dto.timezone?.trim() || 'UTC';

      const existing = await labRepo.findOne({
        where: [{ code }, { subdomain }],
      });
      if (existing) {
        if (existing.code === code) {
          throw new ConflictException(`Lab code "${code}" already exists`);
        }
        if (existing.subdomain === subdomain) {
          throw new ConflictException(`Subdomain "${subdomain}" already exists`);
        }
      }

      const lab = labRepo.create({
        code,
        name,
        subdomain,
        timezone,
        isActive: dto.isActive ?? true,
      });

      const created = await labRepo.save(lab);

      await this.logLabAudit(
        AuditAction.PLATFORM_LAB_CREATE,
        created.id,
        actor,
        {
          newValues: {
            code: created.code,
            name: created.name,
            subdomain: created.subdomain,
            timezone: created.timezone,
            isActive: created.isActive,
          },
          description: `Created lab ${created.name} (${created.code})`,
        },
      );

      return created;
    });
  }

  async updateLab(
    labId: string,
    dto: {
      code?: string;
      name?: string;
      subdomain?: string;
      timezone?: string;
    },
    actor?: PlatformActorContext,
  ): Promise<Lab> {
    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const labRepo = manager.getRepository(Lab);
      const lab = await labRepo.findOne({ where: { id: labId } });
      if (!lab) {
        throw new NotFoundException('Lab not found');
      }

      const oldValues = {
        code: lab.code,
        name: lab.name,
        subdomain: lab.subdomain,
        timezone: lab.timezone,
      };

      let nextCode = lab.code;
      let nextName = lab.name;
      let nextSubdomain = lab.subdomain;
      let nextTimezone = lab.timezone;

      if (dto.code !== undefined) {
        const normalizedCode = dto.code.trim().toUpperCase();
        if (!normalizedCode) {
          throw new BadRequestException('code cannot be empty');
        }
        nextCode = normalizedCode;
      }

      if (dto.name !== undefined) {
        const normalizedName = dto.name.trim();
        if (!normalizedName) {
          throw new BadRequestException('name cannot be empty');
        }
        nextName = normalizedName;
      }

      if (dto.subdomain !== undefined) {
        const normalizedSubdomain = dto.subdomain.trim().toLowerCase();
        if (!normalizedSubdomain) {
          throw new BadRequestException('subdomain cannot be empty');
        }
        nextSubdomain = normalizedSubdomain;
      }

      if (dto.timezone !== undefined) {
        const normalizedTimezone = dto.timezone.trim();
        if (!normalizedTimezone) {
          throw new BadRequestException('timezone cannot be empty');
        }
        nextTimezone = normalizedTimezone;
      }

      if (nextCode !== lab.code) {
        const existingByCode = await labRepo.findOne({ where: { code: nextCode } });
        if (existingByCode && existingByCode.id !== lab.id) {
          throw new ConflictException(`Lab code "${nextCode}" already exists`);
        }
      }

      if (nextSubdomain && nextSubdomain !== lab.subdomain) {
        const existingBySubdomain = await labRepo.findOne({ where: { subdomain: nextSubdomain } });
        if (existingBySubdomain && existingBySubdomain.id !== lab.id) {
          throw new ConflictException(`Subdomain "${nextSubdomain}" already exists`);
        }
      }

      lab.code = nextCode;
      lab.name = nextName;
      lab.subdomain = nextSubdomain;
      lab.timezone = nextTimezone;

      const updated = await labRepo.save(lab);

      await this.logLabAudit(
        AuditAction.PLATFORM_LAB_UPDATE,
        updated.id,
        actor,
        {
          oldValues,
          newValues: {
            code: updated.code,
            name: updated.name,
            subdomain: updated.subdomain,
            timezone: updated.timezone,
          },
          description: `Updated lab ${updated.name} (${updated.code})`,
        },
      );

      return updated;
    });
  }

  async setLabStatus(
    labId: string,
    data: { isActive: boolean; reason: string },
    actor?: PlatformActorContext,
  ): Promise<Lab> {
    const reason = data.reason?.trim();
    if (!reason || reason.length < 3) {
      throw new BadRequestException('reason must be at least 3 characters');
    }

    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const labRepo = manager.getRepository(Lab);
      const lab = await labRepo.findOne({ where: { id: labId } });
      if (!lab) {
        throw new NotFoundException('Lab not found');
      }

      const oldValues = { isActive: lab.isActive };
      lab.isActive = data.isActive;
      const updated = await labRepo.save(lab);

      await this.logLabAudit(
        AuditAction.PLATFORM_LAB_STATUS_CHANGE,
        updated.id,
        actor,
        {
          oldValues,
          newValues: { isActive: updated.isActive, reason },
          description: `${updated.isActive ? 'Enabled' : 'Disabled'} lab ${updated.name} (${updated.code})`,
        },
      );

      return updated;
    });
  }

  async getSummary(
    params: {
      labId?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
    actor?: PlatformActorContext,
  ): Promise<AdminDashboardSummary> {
    const scopeLabId = params.labId?.trim() || undefined;
    const { from, to } = this.resolveDashboardDateRange(params.dateFrom, params.dateTo);
    const { start: todayStart, end: todayEnd } = this.getTodayRange();
    const pendingStatuses = [OrderTestStatus.PENDING, OrderTestStatus.IN_PROGRESS];
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const inactiveThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const labRepo = manager.getRepository(Lab);
      const orderRepo = manager.getRepository(Order);
      const orderTestRepo = manager.getRepository(OrderTest);
      const patientRepo = manager.getRepository(Patient);
      const auditRepo = manager.getRepository(AuditLog);

      const totalLabsPromise = scopeLabId ? labRepo.count({ where: { id: scopeLabId } }) : labRepo.count();
      const activeLabsPromise = scopeLabId
        ? labRepo.count({ where: { id: scopeLabId, isActive: true } })
        : labRepo.count({ where: { isActive: true } });
      const totalPatientsPromise = patientRepo.count();

      const ordersCountQb = orderRepo.createQueryBuilder('o');
      if (scopeLabId) {
        ordersCountQb.where('o.labId = :labId', { labId: scopeLabId });
      }
      const ordersCountPromise = ordersCountQb.getCount();

      const ordersTodayQb = orderRepo
        .createQueryBuilder('o')
        .where('o.registeredAt >= :todayStart AND o.registeredAt <= :todayEnd', {
          todayStart,
          todayEnd,
        });
      if (scopeLabId) {
        ordersTodayQb.andWhere('o.labId = :labId', { labId: scopeLabId });
      }
      const ordersTodayCountPromise = ordersTodayQb.getCount();

      const pendingResultsQb = orderTestRepo
        .createQueryBuilder('ot')
        .innerJoin('ot.sample', 'sample')
        .innerJoin('sample.order', 'o')
        .where('ot.status IN (:...pendingStatuses)', { pendingStatuses })
        .andWhere('o.status != :cancelled', { cancelled: OrderStatus.CANCELLED });
      if (scopeLabId) {
        pendingResultsQb.andWhere('o.labId = :labId', { labId: scopeLabId });
      }
      const pendingResultsCountPromise = pendingResultsQb.getCount();

      const completedTodayQb = orderTestRepo
        .createQueryBuilder('ot')
        .innerJoin('ot.sample', 'sample')
        .innerJoin('sample.order', 'o')
        .where('ot.status = :verifiedStatus', { verifiedStatus: OrderTestStatus.VERIFIED })
        .andWhere('ot.verifiedAt >= :todayStart AND ot.verifiedAt <= :todayEnd', {
          todayStart,
          todayEnd,
        });
      if (scopeLabId) {
        completedTodayQb.andWhere('o.labId = :labId', { labId: scopeLabId });
      }
      const completedTodayCountPromise = completedTodayQb.getCount();

      const ordersByLabPromise = orderRepo
        .createQueryBuilder('o')
        .innerJoin('o.lab', 'lab')
        .leftJoin('o.samples', 'sample')
        .leftJoin('sample.orderTests', 'ot')
        .select('o.labId', 'labId')
        .addSelect('MAX(lab.code)', 'labCode')
        .addSelect('MAX(lab.name)', 'labName')
        .addSelect('COUNT(DISTINCT o.id)', 'ordersCount')
        .addSelect('COUNT(ot.id)', 'totalTestsCount')
        .addSelect('SUM(CASE WHEN ot.status = :verifiedStatus THEN 1 ELSE 0 END)', 'verifiedTestsCount')
        .addSelect(
          'SUM(CASE WHEN ot.status IN (:...pendingStatuses) THEN 1 ELSE 0 END)',
          'pendingResultsCount',
        )
        .where('o.registeredAt >= :from AND o.registeredAt <= :to', {
          from,
          to,
          verifiedStatus: OrderTestStatus.VERIFIED,
          pendingStatuses,
        })
        .andWhere(scopeLabId ? 'o.labId = :scopeLabId' : '1=1', { scopeLabId })
        .groupBy('o.labId')
        .orderBy('COUNT(DISTINCT o.id)', 'DESC')
        .limit(12)
        .getRawMany<{
          labId: string;
          labCode: string;
          labName: string;
          ordersCount: string;
          totalTestsCount: string;
          verifiedTestsCount: string;
          pendingResultsCount: string;
        }>();

      const topTestsPromise = orderTestRepo
        .createQueryBuilder('ot')
        .innerJoin('ot.test', 'test')
        .innerJoin('ot.sample', 'sample')
        .innerJoin('sample.order', 'o')
        .select('test.id', 'testId')
        .addSelect('MAX(test.code)', 'testCode')
        .addSelect('MAX(test.name)', 'testName')
        .addSelect('COUNT(ot.id)', 'ordersCount')
        .addSelect('SUM(CASE WHEN ot.status = :verifiedStatus THEN 1 ELSE 0 END)', 'verifiedCount')
        .where('o.registeredAt >= :from AND o.registeredAt <= :to', {
          from,
          to,
          verifiedStatus: OrderTestStatus.VERIFIED,
        })
        .andWhere(scopeLabId ? 'o.labId = :scopeLabId' : '1=1', { scopeLabId })
        .groupBy('test.id')
        .orderBy('COUNT(ot.id)', 'DESC')
        .addOrderBy('MAX(test.name)', 'ASC')
        .limit(8)
        .getRawMany<{
          testId: string;
          testCode: string;
          testName: string;
          ordersCount: string;
          verifiedCount: string;
        }>();

      const trendRowsPromise = orderRepo
        .createQueryBuilder('o')
        .select("DATE_TRUNC('day', o.registeredAt)", 'day')
        .addSelect('COUNT(*)', 'ordersCount')
        .where('o.registeredAt >= :from AND o.registeredAt <= :to', { from, to })
        .andWhere(scopeLabId ? 'o.labId = :scopeLabId' : '1=1', { scopeLabId })
        .groupBy("DATE_TRUNC('day', o.registeredAt)")
        .orderBy("DATE_TRUNC('day', o.registeredAt)", 'ASC')
        .getRawMany<{ day: string; ordersCount: string }>();

      const inactiveLabsPromise = labRepo
        .createQueryBuilder('lab')
        .leftJoin(Order, 'o', 'o.labId = lab.id')
        .select('lab.id', 'labId')
        .addSelect('lab.code', 'labCode')
        .addSelect('lab.name', 'labName')
        .addSelect('MAX(o.registeredAt)', 'lastOrderAt')
        .where('lab.isActive = true')
        .andWhere(scopeLabId ? 'lab.id = :scopeLabId' : '1=1', { scopeLabId })
        .groupBy('lab.id')
        .addGroupBy('lab.code')
        .addGroupBy('lab.name')
        .having('MAX(o.registeredAt) IS NULL OR MAX(o.registeredAt) < :inactiveThreshold', {
          inactiveThreshold,
        })
        .orderBy('MAX(o.registeredAt)', 'ASC', 'NULLS FIRST')
        .limit(8)
        .getRawMany<{
          labId: string;
          labCode: string;
          labName: string;
          lastOrderAt: string | null;
        }>();

      const highPendingLabsPromise = orderRepo
        .createQueryBuilder('o')
        .innerJoin('o.lab', 'lab')
        .leftJoin('o.samples', 'sample')
        .leftJoin('sample.orderTests', 'ot')
        .select('o.labId', 'labId')
        .addSelect('MAX(lab.code)', 'labCode')
        .addSelect('MAX(lab.name)', 'labName')
        .addSelect('COUNT(ot.id)', 'totalTestsCount')
        .addSelect(
          'SUM(CASE WHEN ot.status IN (:...pendingStatuses) THEN 1 ELSE 0 END)',
          'pendingResultsCount',
        )
        .where('o.registeredAt >= :from AND o.registeredAt <= :to', { from, to, pendingStatuses })
        .andWhere(scopeLabId ? 'o.labId = :scopeLabId' : '1=1', { scopeLabId })
        .groupBy('o.labId')
        .having('COUNT(ot.id) > 0')
        .orderBy(
          'SUM(CASE WHEN ot.status IN (:...pendingStatuses) THEN 1 ELSE 0 END)::float / NULLIF(COUNT(ot.id), 0)',
          'DESC',
        )
        .addOrderBy('COUNT(ot.id)', 'DESC')
        .limit(12)
        .getRawMany<{
          labId: string;
          labCode: string;
          labName: string;
          totalTestsCount: string;
          pendingResultsCount: string;
        }>();

      const failedLoginCountsPromise = auditRepo
        .createQueryBuilder('audit')
        .select('audit."action"', 'action')
        .addSelect('COUNT(*)', 'count')
        .where('audit."createdAt" >= :since24h', { since24h })
        .andWhere('audit."action" IN (:...actions)', {
          actions: [AuditAction.LOGIN_FAILED, AuditAction.PLATFORM_LOGIN_FAILED],
        })
        .andWhere(scopeLabId ? 'audit."labId" = :scopeLabId' : '1=1', { scopeLabId })
        .groupBy('audit."action"')
        .getRawMany<{ action: AuditAction; count: string }>();

      const failedLoginsByLabPromise = auditRepo
        .createQueryBuilder('audit')
        .leftJoin(Lab, 'lab', 'lab.id = audit."labId"')
        .select('audit."labId"', 'labId')
        .addSelect('MAX(lab.code)', 'labCode')
        .addSelect('MAX(lab.name)', 'labName')
        .addSelect('COUNT(*)', 'failedCount')
        .where('audit."createdAt" >= :since24h', { since24h })
        .andWhere('audit."action" = :loginFailed', { loginFailed: AuditAction.LOGIN_FAILED })
        .andWhere(scopeLabId ? 'audit."labId" = :scopeLabId' : '1=1', { scopeLabId })
        .groupBy('audit."labId"')
        .orderBy('COUNT(*)', 'DESC')
        .limit(8)
        .getRawMany<{
          labId: string | null;
          labCode: string | null;
          labName: string | null;
          failedCount: string;
        }>();

      const [
        labsCount,
        activeLabsCount,
        totalPatientsCount,
        ordersCount,
        ordersTodayCount,
        pendingResultsCount,
        completedTodayCount,
        ordersByLabRows,
        topTestsRows,
        trendRows,
        inactiveLabRows,
        highPendingRows,
        failedLoginRows,
        failedLoginsByLabRows,
      ] = await Promise.all([
        totalLabsPromise,
        activeLabsPromise,
        totalPatientsPromise,
        ordersCountPromise,
        ordersTodayCountPromise,
        pendingResultsCountPromise,
        completedTodayCountPromise,
        ordersByLabPromise,
        topTestsPromise,
        trendRowsPromise,
        inactiveLabsPromise,
        highPendingLabsPromise,
        failedLoginCountsPromise,
        failedLoginsByLabPromise,
      ]);

      const ordersByLab = ordersByLabRows.map((row) => {
        const totalTestsCount = Number(row.totalTestsCount) || 0;
        const verifiedTestsCount = Number(row.verifiedTestsCount) || 0;
        const pendingCount = Number(row.pendingResultsCount) || 0;
        return {
          labId: row.labId,
          labCode: row.labCode || '-',
          labName: row.labName || '-',
          ordersCount: Number(row.ordersCount) || 0,
          totalTestsCount,
          verifiedTestsCount,
          pendingResultsCount: pendingCount,
          completionRate: totalTestsCount > 0 ? verifiedTestsCount / totalTestsCount : 0,
        };
      });

      const topTests = topTestsRows.map((row) => ({
        testId: row.testId,
        testCode: row.testCode || '-',
        testName: row.testName || '-',
        ordersCount: Number(row.ordersCount) || 0,
        verifiedCount: Number(row.verifiedCount) || 0,
      }));

      const inactiveLabs = inactiveLabRows.map((row) => {
        const lastOrderDate = row.lastOrderAt ? new Date(row.lastOrderAt) : null;
        const daysSinceLastOrder = lastOrderDate
          ? Math.max(0, Math.floor((Date.now() - lastOrderDate.getTime()) / (24 * 60 * 60 * 1000)))
          : null;
        return {
          labId: row.labId,
          labCode: row.labCode || '-',
          labName: row.labName || '-',
          lastOrderAt: lastOrderDate ? lastOrderDate.toISOString() : null,
          daysSinceLastOrder,
        };
      });

      const highPendingLabs = highPendingRows
        .map((row) => {
          const totalTestsCount = Number(row.totalTestsCount) || 0;
          const pendingCount = Number(row.pendingResultsCount) || 0;
          const pendingRate = totalTestsCount > 0 ? pendingCount / totalTestsCount : 0;
          return {
            labId: row.labId,
            labCode: row.labCode || '-',
            labName: row.labName || '-',
            pendingResultsCount: pendingCount,
            totalTestsCount,
            pendingRate,
          };
        })
        .filter((item) => item.pendingResultsCount >= 5 && item.pendingRate >= 0.35)
        .slice(0, 6);

      const failedByAction = new Map(
        failedLoginRows.map((row) => [row.action, Number(row.count) || 0]),
      );
      const platformFailed = failedByAction.get(AuditAction.PLATFORM_LOGIN_FAILED) ?? 0;
      const labFailed = failedByAction.get(AuditAction.LOGIN_FAILED) ?? 0;
      const failedByLab = failedLoginsByLabRows
        .filter((row) => Boolean(row.labId))
        .map((row) => ({
          labId: row.labId as string,
          labCode: row.labCode || '-',
          labName: row.labName || '-',
          failedCount: Number(row.failedCount) || 0,
        }));

      const summary: AdminDashboardSummary = {
        labsCount,
        activeLabsCount,
        totalPatientsCount,
        ordersCount,
        ordersTodayCount,
        pendingResultsCount,
        completedTodayCount,
        dateRange: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
        ordersTrend: this.buildOrderTrend(from, to, trendRows),
        topTests,
        ordersByLab,
        alerts: {
          inactiveLabs,
          highPendingLabs,
          failedLoginsLast24h: {
            totalCount: platformFailed + labFailed,
            platformCount: platformFailed,
            labCount: labFailed,
            byLab: failedByLab,
          },
        },
      };

      await this.logPlatformSensitiveRead(actor, {
        labId: scopeLabId ?? null,
        entityType: 'dashboard',
        entityId: null,
        description: `Viewed dashboard summary (${scopeLabId ? `lab ${scopeLabId}` : 'all labs'})`,
        metadata: {
          filters: {
            labId: scopeLabId ?? null,
            from: from.toISOString(),
            to: to.toISOString(),
          },
          totals: {
            labsCount,
            ordersCount,
            pendingResultsCount,
          },
        },
      });

      return summary;
    });
  }

  async listOrdersByLab(params: {
    labId: string;
    page?: number;
    size?: number;
  }): Promise<{ items: Order[]; total: number; page: number; size: number; totalPages: number }> {
    if (!params.labId) {
      throw new BadRequestException('labId is required');
    }

    const result = await this.listOrders({
      labId: params.labId,
      page: params.page,
      size: params.size,
    });

    return {
      items: result.items as unknown as Order[],
      total: result.total,
      page: result.page,
      size: result.size,
      totalPages: result.totalPages,
    };
  }

  async listOrders(
    params: {
      labId?: string;
      status?: string;
      q?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      size?: number;
    },
    actor?: PlatformActorContext,
  ): Promise<{ items: AdminOrderListItem[]; total: number; page: number; size: number; totalPages: number }> {
    const page = Math.max(1, params.page ?? 1);
    const size = Math.min(200, Math.max(1, params.size ?? 25));
    const skip = (page - 1) * size;

    if (params.status && !Object.values(OrderStatus).includes(params.status as OrderStatus)) {
      throw new BadRequestException('Invalid status');
    }

    if (params.dateFrom && Number.isNaN(Date.parse(params.dateFrom))) {
      throw new BadRequestException('Invalid dateFrom');
    }
    if (params.dateTo && Number.isNaN(Date.parse(params.dateTo))) {
      throw new BadRequestException('Invalid dateTo');
    }

    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const idsQb = orderRepo
        .createQueryBuilder('o')
        .leftJoin('o.patient', 'patient')
        .leftJoin('o.samples', 'samples');

      if (params.labId) {
        idsQb.andWhere('o.labId = :labId', { labId: params.labId });
      }

      if (params.status) {
        idsQb.andWhere('o.status = :status', { status: params.status });
      }

      if (params.q?.trim()) {
        const q = `%${params.q.trim()}%`;
        idsQb.andWhere(
          '(o.orderNumber ILIKE :q OR patient.fullName ILIKE :q OR patient.phone ILIKE :q OR patient.nationalId ILIKE :q OR samples.barcode ILIKE :q)',
          { q },
        );
      }

      if (params.dateFrom) {
        idsQb.andWhere('o.registeredAt >= :dateFrom', { dateFrom: new Date(params.dateFrom) });
      }

      if (params.dateTo) {
        idsQb.andWhere('o.registeredAt <= :dateTo', { dateTo: new Date(params.dateTo) });
      }

      const countRow = await idsQb
        .clone()
        .select('COUNT(DISTINCT o.id)', 'count')
        .getRawOne<{ count: string }>();
      const total = Number(countRow?.count ?? 0);

      const idRows = await idsQb
        .clone()
        .select('o.id', 'id')
        .addSelect('MAX(o.registeredAt)', 'registeredAt')
        .groupBy('o.id')
        .orderBy('MAX(o.registeredAt)', 'DESC')
        .addOrderBy('o.id', 'DESC')
        .offset(skip)
        .limit(size)
        .getRawMany<{ id: string; registeredAt: Date }>();

      const ids = idRows.map((row) => row.id);
      if (ids.length === 0) {
        const emptyResult = {
          items: [],
          total,
          page,
          size,
          totalPages: Math.ceil(total / size),
        };
        await this.logPlatformSensitiveRead(actor, {
          labId: params.labId ?? null,
          entityType: 'order',
          entityId: null,
          description: 'Viewed orders list (no matching rows)',
          metadata: {
            filters: {
              labId: params.labId ?? null,
              status: params.status ?? null,
              q: params.q ?? null,
              dateFrom: params.dateFrom ?? null,
              dateTo: params.dateTo ?? null,
            },
            page,
            size,
            total,
          },
        });
        return emptyResult;
      }

      const orders = await orderRepo.find({
        where: { id: In(ids) },
        relations: ['patient', 'lab', 'shift', 'samples', 'samples.orderTests'],
      });

      const orderById = new Map(orders.map((order) => [order.id, order]));
      const sortedOrders = ids
        .map((id) => orderById.get(id))
        .filter((order): order is Order => Boolean(order));

      const result = {
        items: sortedOrders.map((order) => this.toAdminOrderListItem(order)),
        total,
        page,
        size,
        totalPages: Math.ceil(total / size),
      };
      await this.logPlatformSensitiveRead(actor, {
        labId: params.labId ?? null,
        entityType: 'order',
        entityId: null,
        description: `Viewed orders list (${result.items.length} rows on page ${page})`,
        metadata: {
          filters: {
            labId: params.labId ?? null,
            status: params.status ?? null,
            q: params.q ?? null,
            dateFrom: params.dateFrom ?? null,
            dateTo: params.dateTo ?? null,
          },
          page,
          size,
          total,
        },
      });
      return result;
    });
  }

  async getOrderDetail(orderId: string, actor?: PlatformActorContext): Promise<{
    id: string;
    labId: string;
    orderNumber: string | null;
    status: OrderStatus;
    patientType: string;
    notes: string | null;
    paymentStatus: string;
    paidAmount: number | null;
    totalAmount: number;
    finalAmount: number;
    registeredAt: Date;
    createdAt: Date;
    updatedAt: Date;
    patient: Order['patient'];
    lab: Order['lab'];
    shift: Order['shift'];
    samples: Order['samples'];
    testsCount: number;
    verifiedTestsCount: number;
    completedTestsCount: number;
    pendingTestsCount: number;
    hasCriticalFlag: boolean;
    lastVerifiedAt: Date | null;
  }> {
    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const order = await manager.getRepository(Order).findOne({
        where: { id: orderId },
        relations: [
          'patient',
          'lab',
          'shift',
          'samples',
          'samples.orderTests',
          'samples.orderTests.test',
        ],
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      const tests = order.samples?.flatMap((sample) => sample.orderTests ?? []) ?? [];
      const testsCount = tests.length;
      const verifiedTestsCount = tests.filter((test) => test.status === 'VERIFIED').length;
      const completedTestsCount = tests.filter((test) => test.status === 'COMPLETED').length;
      const pendingTestsCount = tests.filter(
        (test) => test.status === 'PENDING' || test.status === 'IN_PROGRESS',
      ).length;
      const hasCriticalFlag = tests.some((test) => test.flag === 'HH' || test.flag === 'LL');
      const lastVerifiedAt = tests
        .map((test) => test.verifiedAt)
        .filter((value): value is Date => Boolean(value))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

      const detail = {
        id: order.id,
        labId: order.labId,
        orderNumber: order.orderNumber,
        status: order.status,
        patientType: order.patientType,
        notes: order.notes,
        paymentStatus: order.paymentStatus,
        paidAmount: order.paidAmount,
        totalAmount: Number(order.totalAmount ?? 0),
        finalAmount: Number(order.finalAmount ?? 0),
        registeredAt: order.registeredAt,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        patient: order.patient,
        lab: order.lab,
        shift: order.shift,
        samples: order.samples ?? [],
        testsCount,
        verifiedTestsCount,
        completedTestsCount,
        pendingTestsCount,
        hasCriticalFlag,
        lastVerifiedAt,
      };
      await this.logPlatformSensitiveRead(actor, {
        labId: order.labId,
        entityType: 'order',
        entityId: order.id,
        description: `Viewed order detail ${order.orderNumber ?? order.id}`,
      });
      return detail;
    });
  }

  async generateOrderResultsPdf(
    orderId: string,
    actor?: PlatformActorContext,
  ): Promise<{ pdfBuffer: Buffer; fileName: string }> {
    const order = await this.getOrderDetail(orderId);
    const pdfBuffer = await this.reportsService.generateTestResultsPDF(orderId, order.labId, {
      bypassPaymentCheck: true,
    });

    if (actor?.platformUserId) {
      await this.auditService.log({
        actorType: AuditActorType.PLATFORM_USER,
        actorId: actor.platformUserId,
        labId: order.labId,
        action: AuditAction.REPORT_EXPORT,
        entityType: 'order',
        entityId: orderId,
        description: `Platform admin exported test results PDF for order ${orderId}`,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
      });
    }

    return {
      pdfBuffer,
      fileName: `results-${orderId.substring(0, 8)}.pdf`,
    };
  }

  async listAuditLogs(
    params: AdminAuditLogFilters & {
      page?: number;
      size?: number;
    },
  ): Promise<{ items: AuditLog[]; total: number; page: number; size: number; totalPages: number }> {
    const page = Math.max(1, params.page ?? 1);
    const size = Math.min(200, Math.max(1, params.size ?? 50));
    const skip = (page - 1) * size;
    this.validateAuditLogFilters(params);

    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const qb = this.buildAuditLogsQuery(manager, params);
      const [items, total] = await qb
        .orderBy('audit.createdAt', 'DESC')
        .skip(skip)
        .take(size)
        .getManyAndCount();

      return {
        items,
        total,
        page,
        size,
        totalPages: Math.ceil(total / size),
      };
    });
  }

  async exportAuditLogsCsv(
    params: AdminAuditLogFilters & { reason: string; maxRows?: number },
    actor?: PlatformActorContext,
  ): Promise<{ csvBuffer: Buffer; fileName: string }> {
    const reason = params.reason?.trim();
    if (!reason || reason.length < 3) {
      throw new BadRequestException('reason must be at least 3 characters');
    }
    this.validateAuditLogFilters(params);

    const maxRows = Math.min(5000, Math.max(1, params.maxRows ?? 2000));

    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const qb = this.buildAuditLogsQuery(manager, params);
      const items = await qb
        .orderBy('audit.createdAt', 'DESC')
        .take(maxRows)
        .getMany();

      const csv = this.toAuditLogsCsv(items);
      const fileDate = new Date().toISOString().slice(0, 10);
      const scope = params.labId ? `lab-${params.labId.substring(0, 8)}` : 'all-labs';
      const fileName = `audit-logs-${scope}-${fileDate}.csv`;

      if (actor?.platformUserId) {
        await this.auditService.log({
          actorType: AuditActorType.PLATFORM_USER,
          actorId: actor.platformUserId,
          labId: params.labId ?? null,
          action: AuditAction.REPORT_EXPORT,
          entityType: 'audit_log',
          entityId: null,
          description: `Exported audit logs CSV (${items.length} rows). Reason: ${reason}`,
          newValues: {
            reason,
            exportedRows: items.length,
            maxRows,
            filters: {
              labId: params.labId ?? null,
              actorType: params.actorType ?? null,
              action: params.action ?? null,
              entityType: params.entityType ?? null,
              search: params.search ?? null,
              dateFrom: params.dateFrom ?? null,
              dateTo: params.dateTo ?? null,
            },
          },
          ipAddress: actor.ipAddress ?? null,
          userAgent: actor.userAgent ?? null,
        });
      }

      return {
        csvBuffer: Buffer.from(csv, 'utf8'),
        fileName,
      };
    });
  }

  async getAuditActionOptions(): Promise<string[]> {
    return Object.values(AuditAction);
  }

  async getAuditEntityTypeOptions(params: { labId?: string } = {}): Promise<string[]> {
    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const qb = manager
        .getRepository(AuditLog)
        .createQueryBuilder('audit')
        .select('DISTINCT audit."entityType"', 'entityType')
        .where('audit."entityType" IS NOT NULL');

      if (params.labId) {
        qb.andWhere('audit."labId" = :labId', { labId: params.labId });
      }

      const rows = await qb
        .orderBy('audit."entityType"', 'ASC')
        .getRawMany<{ entityType: string }>();

      return rows
        .map((row) => row.entityType)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
    });
  }

  private validateAuditLogFilters(params: AdminAuditLogFilters): void {
    if (params.actorType && !Object.values(AuditActorType).includes(params.actorType as AuditActorType)) {
      throw new BadRequestException('Invalid actorType');
    }
    if (params.action && !Object.values(AuditAction).includes(params.action as AuditAction)) {
      throw new BadRequestException('Invalid action');
    }
    if (params.dateFrom && Number.isNaN(Date.parse(params.dateFrom))) {
      throw new BadRequestException('Invalid dateFrom');
    }
    if (params.dateTo && Number.isNaN(Date.parse(params.dateTo))) {
      throw new BadRequestException('Invalid dateTo');
    }
    if (params.dateFrom && params.dateTo && new Date(params.dateFrom) > new Date(params.dateTo)) {
      throw new BadRequestException('dateFrom cannot be greater than dateTo');
    }
  }

  private buildAuditLogsQuery(
    manager: EntityManager,
    params: AdminAuditLogFilters,
  ): SelectQueryBuilder<AuditLog> {
    const qb = manager
      .getRepository(AuditLog)
      .createQueryBuilder('audit')
      .leftJoinAndSelect('audit.user', 'user')
      .leftJoinAndSelect('audit.lab', 'lab');

    if (params.labId) {
      qb.andWhere('audit."labId" = :labId', { labId: params.labId });
    }
    if (params.actorType) {
      qb.andWhere('audit."actorType" = :actorType', { actorType: params.actorType });
    }
    if (params.action) {
      qb.andWhere('audit."action" = :action', { action: params.action });
    }
    if (params.entityType) {
      qb.andWhere('audit."entityType" = :entityType', { entityType: params.entityType });
    }
    if (params.dateFrom) {
      qb.andWhere('audit."createdAt" >= :dateFrom', { dateFrom: new Date(params.dateFrom) });
    }
    if (params.dateTo) {
      qb.andWhere('audit."createdAt" <= :dateTo', { dateTo: new Date(params.dateTo) });
    }
    if (params.search?.trim()) {
      const q = `%${params.search.trim()}%`;
      qb.andWhere(
        `(audit."description" ILIKE :q
          OR CAST(audit."action" AS text) ILIKE :q
          OR COALESCE(audit."entityType", '') ILIKE :q
          OR COALESCE(audit."entityId"::text, '') ILIKE :q
          OR COALESCE(audit."actorId"::text, '') ILIKE :q
          OR COALESCE(user.username, '') ILIKE :q
          OR COALESCE(user.fullName, '') ILIKE :q
          OR COALESCE(lab.name, '') ILIKE :q
          OR COALESCE(lab.code, '') ILIKE :q)`,
        { q },
      );
    }

    return qb;
  }

  private toAuditLogsCsv(items: AuditLog[]): string {
    const headers = [
      'timestamp',
      'actorType',
      'actorId',
      'actorUsername',
      'actorName',
      'labCode',
      'labName',
      'action',
      'entityType',
      'entityId',
      'description',
      'ipAddress',
      'userAgent',
      'oldValues',
      'newValues',
    ];

    const rows = items.map((item) => [
      item.createdAt?.toISOString() ?? '',
      item.actorType ?? '',
      item.actorId ?? '',
      item.user?.username ?? '',
      item.user?.fullName ?? '',
      item.lab?.code ?? '',
      item.lab?.name ?? '',
      item.action ?? '',
      item.entityType ?? '',
      item.entityId ?? '',
      item.description ?? '',
      item.ipAddress ?? '',
      item.userAgent ?? '',
      item.oldValues ? JSON.stringify(item.oldValues) : '',
      item.newValues ? JSON.stringify(item.newValues) : '',
    ]);

    const csvLines = [headers, ...rows].map((row) => row.map((cell) => this.csvEscape(cell)).join(','));
    return csvLines.join('\n');
  }

  private csvEscape(value: unknown): string {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  }

  async getSystemHealth(): Promise<AdminSystemHealth> {
    const checkedAt = new Date().toISOString();
    const uptimeSeconds = Math.floor(process.uptime());
    const environment = process.env.NODE_ENV || 'development';

    try {
      const dbInfo = await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
        const rows = await manager.query(`SELECT now() AS "now"`);
        const serverTime = rows?.[0]?.now ? new Date(rows[0].now).toISOString() : null;
        return {
          connected: true,
          serverTime,
          error: null,
        };
      });

      return {
        status: 'ok',
        checkedAt,
        uptimeSeconds,
        environment,
        db: dbInfo,
      };
    } catch (error) {
      return {
        status: 'degraded',
        checkedAt,
        uptimeSeconds,
        environment,
        db: {
          connected: false,
          serverTime: null,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async getPlatformSettingsOverview(): Promise<AdminPlatformSettingsOverview> {
    const [enabledAccounts, totalAccounts] = await this.rlsSessionService.withPlatformAdminContext(
      async (manager) => {
        const enabledRows = await manager.query(
          `SELECT COUNT(*)::int AS "count" FROM "platform_users" WHERE "isActive" = true AND "mfaSecret" IS NOT NULL`,
        );
        const totalRows = await manager.query(
          `SELECT COUNT(*)::int AS "count" FROM "platform_users" WHERE "isActive" = true`,
        );
        return [
          Number(enabledRows?.[0]?.count ?? 0),
          Number(totalRows?.[0]?.count ?? 0),
        ] as const;
      },
    );

    return {
      branding: {
        logoUploadEnabled: false,
        themeColor: '#1677ff',
      },
      securityPolicy: {
        sessionTimeoutMinutes: Number(process.env.PLATFORM_SESSION_TIMEOUT_MINUTES || 30),
        passwordMinLength: Number(process.env.PLATFORM_PASSWORD_MIN_LENGTH || 8),
        requireStrongPassword: process.env.PLATFORM_REQUIRE_STRONG_PASSWORD !== 'false',
      },
      mfa: {
        mode: (process.env.PLATFORM_MFA_MODE === 'required' ? 'REQUIRED' : 'OPTIONAL'),
        enabledAccounts,
        totalAccounts,
      },
    };
  }

  async getSettingsRoles(): Promise<string[]> {
    return this.settingsService.getRoles();
  }

  async getLabSettings(labId: string, actor?: PlatformActorContext) {
    const settings = await this.settingsService.getLabSettings(labId);
    await this.logPlatformSensitiveRead(actor, {
      labId,
      entityType: 'lab_settings',
      entityId: labId,
      description: `Viewed lab settings for ${settings.name} (${settings.code})`,
    });
    return settings;
  }

  async updateLabSettings(
    labId: string,
    data: {
      labelSequenceBy?: string;
      sequenceResetBy?: string;
      enableOnlineResults?: boolean;
      onlineResultWatermarkDataUrl?: string | null;
      onlineResultWatermarkText?: string | null;
      printing?: {
        mode?: 'browser' | 'direct_qz';
        receiptPrinterName?: string | null;
        labelsPrinterName?: string | null;
        reportPrinterName?: string | null;
      };
      reportBranding?: {
        bannerDataUrl?: string | null;
        footerDataUrl?: string | null;
        logoDataUrl?: string | null;
        watermarkDataUrl?: string | null;
      };
    },
  ) {
    return this.settingsService.updateLabSettings(labId, data);
  }

  async getLabUsers(labId: string, actor?: PlatformActorContext): Promise<User[]> {
    const users = await this.settingsService.getUsersForLab(labId);
    await this.logPlatformSensitiveRead(actor, {
      labId,
      entityType: 'user',
      entityId: null,
      description: `Viewed lab users list (${users.length} users)`,
      metadata: { usersCount: users.length },
    });
    return users;
  }

  async getLabUser(userId: string, labId: string, actor?: PlatformActorContext): Promise<{
    user: User;
    labIds: string[];
    shiftIds: string[];
    departmentIds: string[];
  }> {
    const detail = await this.settingsService.getUserWithDetails(userId, labId);
    await this.logPlatformSensitiveRead(actor, {
      labId,
      entityType: 'user',
      entityId: userId,
      description: `Viewed lab user details for ${detail.user.username}`,
    });
    return detail;
  }

  async createLabUser(
    labId: string,
    data: {
      username: string;
      password: string;
      fullName?: string;
      email?: string;
      role: string;
      shiftIds?: string[];
      departmentIds?: string[];
    },
  ): Promise<User> {
    return this.settingsService.createUser(labId, data);
  }

  async updateLabUser(
    userId: string,
    labId: string,
    data: {
      fullName?: string;
      email?: string;
      role?: string;
      defaultLabId?: string;
      isActive?: boolean;
      shiftIds?: string[];
      departmentIds?: string[];
      password?: string;
    },
  ): Promise<User> {
    return this.settingsService.updateUser(userId, labId, data);
  }

  async deleteLabUser(userId: string, labId: string): Promise<{ success: true }> {
    await this.settingsService.deleteUser(userId, labId, '__platform_admin__');
    return { success: true };
  }

  async resetLabUserPassword(
    userId: string,
    labId: string,
    data: { password: string; reason: string },
    actor?: PlatformActorContext,
  ): Promise<{ success: true }> {
    const password = data.password?.trim();
    const reason = data.reason?.trim();

    if (!password || password.length < 8) {
      throw new BadRequestException('password must be at least 8 characters');
    }
    if (!reason || reason.length < 3) {
      throw new BadRequestException('reason must be at least 3 characters');
    }

    const detail = await this.settingsService.getUserWithDetails(userId, labId);
    await this.settingsService.updateUser(userId, labId, { password });

    if (actor?.platformUserId) {
      await this.auditService.log({
        actorType: AuditActorType.PLATFORM_USER,
        actorId: actor.platformUserId,
        labId,
        action: AuditAction.USER_UPDATE,
        entityType: 'user',
        entityId: userId,
        description: `Platform admin reset password for lab user ${detail.user.username}`,
        newValues: {
          operation: 'RESET_PASSWORD',
          reason,
        },
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
      });
    }

    return { success: true };
  }

  async getImpersonationStatus(user: {
    platformUserId: string;
    role: string;
    impersonatedLabId?: string | null;
  }): Promise<AdminImpersonationStatus> {
    const impersonatedLabId = user.impersonatedLabId?.trim() || null;
    if (!impersonatedLabId) {
      return { active: false, labId: null, lab: null };
    }

    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const lab = await manager.getRepository(Lab).findOne({ where: { id: impersonatedLabId } });
      return {
        active: true,
        labId: impersonatedLabId,
        lab: lab
          ? {
              id: lab.id,
              code: lab.code,
              name: lab.name,
              subdomain: lab.subdomain,
              isActive: lab.isActive,
            }
          : null,
      };
    });
  }

  async startImpersonation(
    data: { labId: string; reason: string },
    actor: {
      platformUserId: string;
      role: string;
      impersonatedLabId?: string | null;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
  ): Promise<{ accessToken: string; impersonation: AdminImpersonationStatus }> {
    const reason = data.reason?.trim();
    if (!reason || reason.length < 3) {
      throw new BadRequestException('reason must be at least 3 characters');
    }

    const lab = await this.rlsSessionService.withPlatformAdminContext(async (manager) =>
      manager.getRepository(Lab).findOne({ where: { id: data.labId } }),
    );
    if (!lab) {
      throw new NotFoundException('Lab not found');
    }
    if (!lab.isActive) {
      throw new BadRequestException('Cannot impersonate a disabled lab');
    }

    const issued = await this.adminAuthService.issueAccessTokenByPlatformUserId(actor.platformUserId, {
      impersonatedLabId: lab.id,
    });

    await this.auditService.log({
      actorType: AuditActorType.PLATFORM_USER,
      actorId: actor.platformUserId,
      labId: lab.id,
      action: AuditAction.PLATFORM_IMPERSONATE_START,
      entityType: 'lab',
      entityId: lab.id,
      description: `Platform admin started impersonation for lab ${lab.name} (${lab.code})`,
      newValues: {
        reason,
        previousImpersonatedLabId: actor.impersonatedLabId ?? null,
      },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
    });

    return {
      accessToken: issued.accessToken,
      impersonation: {
        active: true,
        labId: lab.id,
        lab: {
          id: lab.id,
          code: lab.code,
          name: lab.name,
          subdomain: lab.subdomain,
          isActive: lab.isActive,
        },
      },
    };
  }

  async stopImpersonation(actor: {
    platformUserId: string;
    role: string;
    impersonatedLabId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<{ accessToken: string; impersonation: AdminImpersonationStatus }> {
    const previousLabId = actor.impersonatedLabId?.trim() || null;
    const issued = await this.adminAuthService.issueAccessTokenByPlatformUserId(actor.platformUserId, {
      impersonatedLabId: null,
    });

    if (previousLabId) {
      await this.auditService.log({
        actorType: AuditActorType.PLATFORM_USER,
        actorId: actor.platformUserId,
        labId: previousLabId,
        action: AuditAction.PLATFORM_IMPERSONATE_STOP,
        entityType: 'lab',
        entityId: previousLabId,
        description: `Platform admin stopped impersonation for lab ${previousLabId}`,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
      });
    }

    return {
      accessToken: issued.accessToken,
      impersonation: {
        active: false,
        labId: null,
        lab: null,
      },
    };
  }

  async createImpersonatedLabPortalToken(actor: {
    platformUserId: string;
    role: string;
    impersonatedLabId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<{
    bridgeToken: string;
    expiresAt: string;
    lab: {
      id: string;
      code: string;
      name: string;
      subdomain: string | null;
    };
  }> {
    const impersonatedLabId = actor.impersonatedLabId?.trim() || null;
    if (!impersonatedLabId) {
      throw new BadRequestException('Impersonation is not active');
    }

    const lab = await this.rlsSessionService.withPlatformAdminContext(async (manager) =>
      manager.getRepository(Lab).findOne({ where: { id: impersonatedLabId } }),
    );
    if (!lab || !lab.isActive) {
      throw new NotFoundException('Impersonated lab is not available');
    }

    return this.authService.issueLabPortalBridgeToken({
      platformUserId: actor.platformUserId,
      labId: impersonatedLabId,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
    });
  }

  async getLabShifts(labId: string): Promise<Shift[]> {
    return this.settingsService.getShiftsForLab(labId);
  }

  async getLabDepartments(labId: string): Promise<Department[]> {
    return this.settingsService.getDepartmentsForLab(labId);
  }

  private async toAdminLabListItems(
    manager: EntityManager,
    labs: Lab[],
  ): Promise<AdminLabListItem[]> {
    if (!labs.length) {
      return [];
    }

    const labIds = labs.map((lab) => lab.id);
    const userRows = await manager
      .getRepository(UserLabAssignment)
      .createQueryBuilder('ula')
      .select('ula.labId', 'labId')
      .addSelect('COUNT(DISTINCT ula.userId)', 'usersCount')
      .where('ula.labId IN (:...labIds)', { labIds })
      .groupBy('ula.labId')
      .getRawMany<{ labId: string; usersCount: string }>();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ordersRows = await manager
      .getRepository(Order)
      .createQueryBuilder('o')
      .select('o.labId', 'labId')
      .addSelect('COUNT(*)', 'orders30dCount')
      .where('o.labId IN (:...labIds)', { labIds })
      .andWhere('o.registeredAt >= :thirtyDaysAgo', { thirtyDaysAgo })
      .groupBy('o.labId')
      .getRawMany<{ labId: string; orders30dCount: string }>();

    const usersByLab = new Map(userRows.map((row) => [row.labId, Number(row.usersCount) || 0]));
    const ordersByLab = new Map(
      ordersRows.map((row) => [row.labId, Number(row.orders30dCount) || 0]),
    );

    return labs.map((lab) => ({
      ...lab,
      usersCount: usersByLab.get(lab.id) ?? 0,
      orders30dCount: ordersByLab.get(lab.id) ?? 0,
    }));
  }

  private resolveDashboardDateRange(
    rawDateFrom?: string,
    rawDateTo?: string,
  ): { from: Date; to: Date } {
    const now = new Date();
    const defaultTo = new Date(now);
    const defaultFrom = new Date(defaultTo.getTime() - 29 * 24 * 60 * 60 * 1000);

    const from = rawDateFrom ? new Date(rawDateFrom) : defaultFrom;
    const to = rawDateTo ? new Date(rawDateTo) : defaultTo;

    if (Number.isNaN(from.getTime())) {
      throw new BadRequestException('Invalid dateFrom');
    }
    if (Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid dateTo');
    }
    if (from > to) {
      throw new BadRequestException('dateFrom cannot be greater than dateTo');
    }

    const rangeDays = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    if (rangeDays > 120) {
      throw new BadRequestException('Date range too large (max 120 days)');
    }

    return { from, to };
  }

  private getTodayRange(): { start: Date; end: Date } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  private buildOrderTrend(
    from: Date,
    to: Date,
    rows: Array<{ day: string; ordersCount: string }>,
  ): AdminDashboardTrendPoint[] {
    const countsByDate = new Map<string, number>();
    for (const row of rows) {
      const key = this.normalizeDateKey(row.day);
      countsByDate.set(key, Number(row.ordersCount) || 0);
    }

    const trend: AdminDashboardTrendPoint[] = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);

    while (cursor.getTime() <= end.getTime()) {
      const key = this.normalizeDateKey(cursor);
      trend.push({
        date: key,
        ordersCount: countsByDate.get(key) ?? 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return trend;
  }

  private normalizeDateKey(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toSubdomainFromCode(code: string): string {
    return code.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  }

  private toAdminOrderListItem(order: Order): AdminOrderListItem {
    const tests = order.samples?.flatMap((sample) => sample.orderTests ?? []) ?? [];
    const verifiedTestsCount = tests.filter((test) => test.status === 'VERIFIED').length;
    const hasCriticalFlag = tests.some((test) => test.flag === 'HH' || test.flag === 'LL');
    const firstBarcode = order.samples?.find((sample) => Boolean(sample.barcode))?.barcode ?? null;

    return {
      id: order.id,
      labId: order.labId,
      labCode: order.lab?.code ?? null,
      labName: order.lab?.name ?? null,
      orderNumber: order.orderNumber,
      status: order.status,
      registeredAt: order.registeredAt,
      patientId: order.patientId,
      patientName: order.patient?.fullName ?? null,
      patientPhone: order.patient?.phone ?? null,
      paymentStatus: order.paymentStatus ?? null,
      finalAmount: Number(order.finalAmount ?? 0),
      testsCount: tests.length,
      verifiedTestsCount,
      hasCriticalFlag,
      barcode: firstBarcode,
    };
  }

  private async logPlatformSensitiveRead(
    actor: PlatformActorContext | undefined,
    payload: {
      labId?: string | null;
      entityType: string;
      entityId?: string | null;
      description: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    if (!actor?.platformUserId) return;

    await this.auditService.log({
      actorType: AuditActorType.PLATFORM_USER,
      actorId: actor.platformUserId,
      labId: payload.labId ?? null,
      action: AuditAction.PLATFORM_SENSITIVE_READ,
      entityType: payload.entityType,
      entityId: payload.entityId ?? null,
      description: payload.description,
      newValues: payload.metadata ?? null,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
    });
  }

  private async logLabAudit(
    action: AuditAction,
    labId: string,
    actor: PlatformActorContext | undefined,
    payload: {
      oldValues?: Record<string, unknown>;
      newValues?: Record<string, unknown>;
      description: string;
    },
  ): Promise<void> {
    if (!actor?.platformUserId) return;

    await this.auditService.log({
      actorType: AuditActorType.PLATFORM_USER,
      actorId: actor.platformUserId,
      action,
      entityType: 'lab',
      entityId: labId,
      labId,
      oldValues: payload.oldValues ?? null,
      newValues: payload.newValues ?? null,
      description: payload.description,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
    });
  }
}
