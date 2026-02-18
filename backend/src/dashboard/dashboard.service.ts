import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from '../entities/patient.entity';
import { OrderTest, OrderTestStatus, ResultFlag } from '../entities/order-test.entity';
import { OrdersService } from '../orders/orders.service';
import { UnmatchedResultsService } from '../unmatched/unmatched-results.service';

export interface DashboardKpis {
  ordersToday: number;
  pendingVerification: number;
  criticalAlerts: number;
  avgTatHours: number | null;
  totalPatients: number;
}

export interface OrdersTrendPoint {
  date: string;
  count: number;
}

export interface StatisticsDto {
  orders: {
    total: number;
    byStatus: Record<string, number>;
    byShift: { shiftId: string | null; shiftName: string; count: number }[];
  };
  revenue: number;
  tests: {
    total: number;
    byDepartment: { departmentId: string | null; departmentName: string; count: number }[];
    byTest: { testId: string; testCode: string; testName: string; count: number }[];
    byShift: { shiftId: string | null; shiftName: string; count: number }[];
  };
  tat: {
    medianMinutes: number | null;
    p95Minutes: number | null;
    withinTargetCount: number;
    withinTargetTotal: number;
    targetMinutes: number;
  };
  quality: {
    abnormalCount: number;
    criticalCount: number;
    totalVerified: number;
  };
  unmatched: {
    pending: number;
    resolved: number;
    discarded: number;
    byReason: Record<string, number>;
  };
  instrumentWorkload: { instrumentId: string; instrumentName: string; count: number }[];
}

const TAT_TARGET_MINUTES = 60;

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(OrderTest)
    private readonly orderTestRepo: Repository<OrderTest>,
    private readonly ordersService: OrdersService,
    private readonly unmatchedService: UnmatchedResultsService,
  ) {}

  async getKpis(labId: string): Promise<DashboardKpis> {
    const totalPatients = await this.patientRepo.count();
    const ordersToday = await this.ordersService.getOrdersTodayCount(labId);

    // Count completed (awaiting verification) order tests
    const pendingVerification = await this.orderTestRepo
      .createQueryBuilder('ot')
      .innerJoin('ot.sample', 's')
      .innerJoin('s.order', 'o')
      .where('o.labId = :labId', { labId })
      .andWhere('ot.status = :status', { status: OrderTestStatus.COMPLETED })
      .getCount();

    // Count critical results (CRITICAL_HIGH or CRITICAL_LOW flags)
    // ResultFlag.CRITICAL_HIGH = 'HH', ResultFlag.CRITICAL_LOW = 'LL'
    const criticalAlerts = await this.orderTestRepo
      .createQueryBuilder('ot')
      .innerJoin('ot.sample', 's')
      .innerJoin('s.order', 'o')
      .where('o.labId = :labId', { labId })
      .andWhere('ot.flag IN (:...flags)', { flags: [ResultFlag.CRITICAL_HIGH, ResultFlag.CRITICAL_LOW] })
      .andWhere('ot.status != :verified', { verified: OrderTestStatus.VERIFIED })
      .getCount();

    return {
      ordersToday,
      pendingVerification,
      criticalAlerts,
      avgTatHours: null, // Will be implemented with TAT tracking
      totalPatients,
    };
  }

  async getOrdersTrend(labId: string, days: number): Promise<OrdersTrendPoint[]> {
    return this.ordersService.getOrdersTrend(labId, days);
  }

  async getStatistics(labId: string, startDate: Date, endDate: Date): Promise<StatisticsDto> {
    const [orderStats, testsData, tatData, qualityData, unmatchedStats, instrumentWorkload] =
      await Promise.all([
        this.ordersService.getOrderStatsForPeriod(labId, startDate, endDate),
        this.getTestsStatsForPeriod(labId, startDate, endDate),
        this.getTatForPeriod(labId, startDate, endDate),
        this.getQualityForPeriod(labId, startDate, endDate),
        this.unmatchedService.getStats(labId),
        this.unmatchedService.getCountByInstrumentInPeriod(labId, startDate, endDate),
      ]);

    return {
      orders: {
        total: orderStats.total,
        byStatus: orderStats.byStatus,
        byShift: orderStats.byShift,
      },
      revenue: orderStats.revenue,
      tests: testsData,
      tat: tatData,
      quality: qualityData,
      unmatched: unmatchedStats,
      instrumentWorkload,
    };
  }

  private async getTestsStatsForPeriod(
    labId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    total: number;
    byDepartment: { departmentId: string | null; departmentName: string; count: number }[];
    byTest: { testId: string; testCode: string; testName: string; count: number }[];
    byShift: { shiftId: string | null; shiftName: string; count: number }[];
  }> {
    const total = await this.orderTestRepo
      .createQueryBuilder('ot')
      .innerJoin('ot.sample', 's')
      .innerJoin('s.order', 'o')
      .where('o.labId = :labId', { labId })
      .andWhere('o.registeredAt BETWEEN :startDate AND :endDate', { startDate, endDate })
      .getCount();

    const [deptRows, testRows, shiftRows] = await Promise.all([
      this.orderTestRepo
        .createQueryBuilder('ot')
        .innerJoin('ot.sample', 's')
        .innerJoin('s.order', 'o')
        .innerJoin('ot.test', 't')
        .leftJoin('t.department', 'd')
        .select('t.departmentId', 'departmentId')
        .addSelect('MAX(COALESCE(d.name, d.code))', 'departmentName')
        .addSelect('COUNT(*)', 'count')
        .where('o.labId = :labId', { labId })
        .andWhere('o.registeredAt BETWEEN :startDate AND :endDate', { startDate, endDate })
        .groupBy('t.departmentId')
        .getRawMany(),
      this.orderTestRepo
        .createQueryBuilder('ot')
        .innerJoin('ot.sample', 's')
        .innerJoin('s.order', 'o')
        .innerJoin('ot.test', 't')
        .select('t.id', 'testId')
        .addSelect('t.code', 'testCode')
        .addSelect('MAX(t.name)', 'testName')
        .addSelect('COUNT(*)', 'count')
        .where('o.labId = :labId', { labId })
        .andWhere('o.registeredAt BETWEEN :startDate AND :endDate', { startDate, endDate })
        .groupBy('t.id')
        .addGroupBy('t.code')
        .getRawMany(),
      this.orderTestRepo
        .createQueryBuilder('ot')
        .innerJoin('ot.sample', 's')
        .innerJoin('s.order', 'o')
        .leftJoin('o.shift', 'shift')
        .select('o.shiftId', 'shiftId')
        .addSelect('MAX(COALESCE(shift.name, shift.code))', 'shiftName')
        .addSelect('COUNT(*)', 'count')
        .where('o.labId = :labId', { labId })
        .andWhere('o.registeredAt BETWEEN :startDate AND :endDate', { startDate, endDate })
        .groupBy('o.shiftId')
        .getRawMany(),
    ]);

    const byDepartment = deptRows.map((r) => ({
      departmentId: r.departmentId as string | null,
      departmentName: String(r.departmentName || r.departmentId || 'Unassigned'),
      count: parseInt(r.count, 10),
    }));

    const byTest = testRows.map((r) => ({
      testId: r.testId as string,
      testCode: String(r.testCode ?? ''),
      testName: String(r.testName ?? r.testCode ?? ''),
      count: parseInt(r.count, 10),
    }));

    const byShift = shiftRows.map((r) => ({
      shiftId: r.shiftId as string | null,
      shiftName: String(r.shiftName || r.shiftId || 'No shift'),
      count: parseInt(r.count, 10),
    }));

    return { total, byDepartment, byTest, byShift };
  }

  private async getTatForPeriod(
    labId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    medianMinutes: number | null;
    p95Minutes: number | null;
    withinTargetCount: number;
    withinTargetTotal: number;
    targetMinutes: number;
  }> {
    const rows = await this.orderTestRepo
      .createQueryBuilder('ot')
      .innerJoin('ot.sample', 's')
      .innerJoin('s.order', 'o')
      .select('EXTRACT(EPOCH FROM (ot.verifiedAt - o.registeredAt)) / 60', 'minutes')
      .where('o.labId = :labId', { labId })
      .andWhere('ot.verifiedAt IS NOT NULL')
      .andWhere('o.registeredAt BETWEEN :startDate AND :endDate', { startDate, endDate })
      .getRawMany();

    const minutes = rows
      .map((r) => parseFloat(r.minutes))
      .filter((m) => Number.isFinite(m) && m >= 0);
    const n = minutes.length;
    if (n === 0) {
      return {
        medianMinutes: null,
        p95Minutes: null,
        withinTargetCount: 0,
        withinTargetTotal: 0,
        targetMinutes: TAT_TARGET_MINUTES,
      };
    }
    minutes.sort((a, b) => a - b);
    const medianMinutes = n % 2 === 1 ? minutes[Math.floor(n / 2)] : (minutes[n / 2 - 1] + minutes[n / 2]) / 2;
    const p95Idx = Math.min(n - 1, Math.ceil(n * 0.95) - 1);
    const p95Minutes = minutes[p95Idx];
    const withinTargetCount = minutes.filter((m) => m <= TAT_TARGET_MINUTES).length;
    return {
      medianMinutes: Math.round(medianMinutes * 10) / 10,
      p95Minutes: Math.round(p95Minutes * 10) / 10,
      withinTargetCount,
      withinTargetTotal: n,
      targetMinutes: TAT_TARGET_MINUTES,
    };
  }

  private async getQualityForPeriod(
    labId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ abnormalCount: number; criticalCount: number; totalVerified: number }> {
    const base = this.orderTestRepo
      .createQueryBuilder('ot')
      .innerJoin('ot.sample', 's')
      .innerJoin('s.order', 'o')
      .where('o.labId = :labId', { labId })
      .andWhere('ot.status = :verified', { verified: OrderTestStatus.VERIFIED })
      .andWhere('o.registeredAt BETWEEN :startDate AND :endDate', { startDate, endDate });

    const [abnormalCount, criticalCount, totalVerified] = await Promise.all([
      base
        .clone()
        .andWhere('ot.flag IN (:...flags)', { flags: [ResultFlag.HIGH, ResultFlag.LOW] })
        .getCount(),
      base
        .clone()
        .andWhere('ot.flag IN (:...flags)', { flags: [ResultFlag.CRITICAL_HIGH, ResultFlag.CRITICAL_LOW] })
        .getCount(),
      base.clone().getCount(),
    ]);

    return { abnormalCount, criticalCount, totalVerified };
  }
}
