import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { DashboardService, DashboardKpis, OrdersTrendPoint, StatisticsDto } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { StatisticsQueryDto } from './dto/statistics-query.dto';
import { Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../entities/audit-log.entity';
import { buildLabActorContext } from '../types/lab-actor-context';
import {
  addDaysToDateKey,
  formatDateKeyForTimeZone,
  getUtcRangeForLabDate,
} from '../database/lab-timezone.util';

interface RequestWithUser {
  user: {
    userId?: string | null;
    username: string;
    labId: string;
    role?: string;
    platformUserId?: string | null;
    isImpersonation?: boolean;
  };
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly auditService: AuditService,
  ) {}

  @Get('kpis')
  async getKpis(@Req() req: RequestWithUser): Promise<DashboardKpis> {
    const labId = req.user?.labId;
    if (!labId) {
      return {
        ordersToday: 0,
        pendingVerification: 0,
        criticalAlerts: 0,
        avgTatHours: null,
        totalPatients: 0,
      };
    }
    return this.dashboardService.getKpis(labId);
  }

  @Get('orders-trend')
  async getOrdersTrend(
    @Req() req: RequestWithUser,
    @Query('days') days?: string,
  ): Promise<{ data: OrdersTrendPoint[] }> {
    const labId = req.user?.labId;
    const numDays = Math.min(31, Math.max(1, parseInt(days || '7', 10) || 7));
    const data = labId
      ? await this.dashboardService.getOrdersTrend(labId, numDays)
      : [];
    return { data };
  }

  @Get('statistics')
  @UseGuards(RolesGuard)
  @Roles('LAB_ADMIN', 'SUPER_ADMIN')
  async getStatistics(
    @Req() req: RequestWithUser,
    @Query() query: StatisticsQueryDto,
  ): Promise<StatisticsDto> {
    const labId = req.user?.labId;
    if (!labId) {
      return this.emptyStatistics();
    }
    const timeZone = await this.dashboardService.getLabTimeZone(labId);
    const { startDate, endDate } = this.resolveRange(timeZone, query.startDate, query.endDate);
    return this.dashboardService.getStatistics(labId, startDate, endDate, {
      shiftId: query.shiftId ?? null,
      departmentId: query.departmentId ?? null,
    });
  }

  @Get('statistics/pdf')
  @UseGuards(RolesGuard)
  @Roles('LAB_ADMIN', 'SUPER_ADMIN')
  async getStatisticsPdf(
    @Req() req: RequestWithUser,
    @Query() query: StatisticsQueryDto,
    @Res() res: Response,
  ) {
    const labId = req.user?.labId;
    if (!labId) {
      return res.status(401).json({ message: 'Lab ID not found in token' });
    }

    const timeZone = await this.dashboardService.getLabTimeZone(labId);
    const { startDate, endDate, startDateLabel, endDateLabel } = this.resolveRange(
      timeZone,
      query.startDate,
      query.endDate,
    );
    const shiftToken = query.shiftId ? this.toSafeFileToken(query.shiftId) : 'all';
    const departmentToken = query.departmentId ? this.toSafeFileToken(query.departmentId) : 'all';
    const fileName = `statistics-${startDateLabel}-to-${endDateLabel}-${shiftToken}-${departmentToken}.pdf`;
    const actor = buildLabActorContext(req.user);

    try {
      const pdfBuffer = await this.dashboardService.generateStatisticsPdf(labId, startDate, endDate, {
        shiftId: query.shiftId ?? null,
        departmentId: query.departmentId ?? null,
      });

      const impersonationAudit =
        actor.isImpersonation && actor.platformUserId
          ? {
              impersonation: {
                active: true,
                platformUserId: actor.platformUserId,
              },
            }
          : {};

      await this.auditService.log({
        actorType: actor.actorType,
        actorId: actor.actorId,
        labId,
        userId: actor.userId,
        action: AuditAction.REPORT_EXPORT,
        entityType: 'dashboard_statistics',
        entityId: null,
        description: 'Exported statistics PDF',
        newValues: {
          startDate: startDateLabel,
          endDate: endDateLabel,
          shiftId: query.shiftId ?? null,
          departmentId: query.departmentId ?? null,
          ...impersonationAudit,
        },
        ipAddress: req.ip ?? null,
        userAgent: (req.headers?.['user-agent'] as string | undefined) ?? null,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(pdfBuffer);
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to generate statistics PDF',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private emptyStatistics(): StatisticsDto {
    return {
      orders: { total: 0, byStatus: {}, byShift: [] },
      profit: 0,
      revenue: 0,
      departmentTestTotal: 0,
      tests: { total: 0, byDepartment: [], byTest: [], byShift: [] },
      tat: {
        medianMinutes: null,
        p95Minutes: null,
        withinTargetCount: 0,
        withinTargetTotal: 0,
        targetMinutes: 60,
      },
      quality: { abnormalCount: 0, criticalCount: 0, totalVerified: 0 },
      unmatched: { pending: 0, resolved: 0, discarded: 0, byReason: {} },
      instrumentWorkload: [],
    };
  }

  private resolveRange(
    timeZone: string,
    startDateStr?: string,
    endDateStr?: string,
  ): { startDate: Date; endDate: Date; startDateLabel: string; endDateLabel: string } {
    let startDateLabel = startDateStr?.trim() ?? '';
    let endDateLabel = endDateStr?.trim() ?? '';

    let startDate: Date;
    let endDate: Date;
    try {
      endDateLabel = endDateLabel || formatDateKeyForTimeZone(new Date(), timeZone);
      startDateLabel = startDateLabel || addDaysToDateKey(endDateLabel, -30);
      ({ startDate } = getUtcRangeForLabDate(startDateLabel, timeZone));
      ({ endDate } = getUtcRangeForLabDate(endDateLabel, timeZone));
    } catch {
      throw new BadRequestException('Invalid date range. Expected YYYY-MM-DD.');
    }

    if (startDate.getTime() > endDate.getTime()) {
      throw new BadRequestException('startDate cannot be after endDate');
    }
    return { startDate, endDate, startDateLabel, endDateLabel };
  }

  private toSafeFileToken(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'all';
  }
}
