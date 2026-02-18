import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { DashboardService, DashboardKpis, OrdersTrendPoint, StatisticsDto } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

interface RequestWithUser {
  user: { userId: string; username: string; labId: string; role?: string };
}

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

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
    @Query('startDate') startDateStr?: string,
    @Query('endDate') endDateStr?: string,
  ): Promise<StatisticsDto> {
    const labId = req.user?.labId;
    if (!labId) {
      return this.emptyStatistics();
    }
    const endDate = endDateStr ? new Date(endDateStr) : new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = startDateStr ? new Date(startDateStr) : new Date(endDate);
    if (!startDateStr) {
      startDate.setDate(startDate.getDate() - 30);
    }
    startDate.setHours(0, 0, 0, 0);
    return this.dashboardService.getStatistics(labId, startDate, endDate);
  }

  private emptyStatistics(): StatisticsDto {
    return {
      orders: { total: 0, byStatus: {}, byShift: [] },
      revenue: 0,
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
}
