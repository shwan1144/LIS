import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from '../entities/patient.entity';
import { OrderTest, OrderTestStatus, ResultFlag } from '../entities/order-test.entity';
import { OrderStatus, Order } from '../entities/order.entity';
import { Lab } from '../entities/lab.entity';
import { Shift } from '../entities/shift.entity';
import { Department } from '../entities/department.entity';
import { OrdersService } from '../orders/orders.service';
import { UnmatchedResultsService } from '../unmatched/unmatched-results.service';
import { normalizeLabTimeZone } from '../database/lab-timezone.util';

// require() for CommonJS interop (pdfkit has no default export in some builds)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

type PdfKitDocument = InstanceType<typeof PDFDocument>;

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
  profit: number;
  revenue: number;
  departmentTestTotal: number;
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

export interface StatisticsFilterOptions {
  shiftId?: string | null;
  departmentId?: string | null;
}

const TAT_TARGET_MINUTES = 60;

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(OrderTest)
    private readonly orderTestRepo: Repository<OrderTest>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Lab)
    private readonly labRepo: Repository<Lab>,
    @InjectRepository(Shift)
    private readonly shiftRepo: Repository<Shift>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    private readonly ordersService: OrdersService,
    private readonly unmatchedService: UnmatchedResultsService,
  ) { }

  async getKpis(labId: string): Promise<DashboardKpis> {
    const totalPatients = await this.patientRepo.count();
    const ordersToday = await this.ordersService.getOrdersTodayCount(labId);

    // Count completed (awaiting verification) order tests — root-level only (panels = 1)
    const pendingVerification = await this.orderTestRepo
      .createQueryBuilder('ot')
      .innerJoin('ot.sample', 's')
      .innerJoin('s.order', 'o')
      .where('o.labId = :labId', { labId })
      .andWhere('ot.parentOrderTestId IS NULL')
      .andWhere('ot.status = :status', { status: OrderTestStatus.COMPLETED })
      .getCount();

    // Count critical results — root-level only (panels = 1)
    const criticalAlerts = await this.orderTestRepo
      .createQueryBuilder('ot')
      .innerJoin('ot.sample', 's')
      .innerJoin('s.order', 'o')
      .where('o.labId = :labId', { labId })
      .andWhere('ot.parentOrderTestId IS NULL')
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

  async getLabTimeZone(labId: string): Promise<string> {
    const lab = await this.labRepo.findOne({ where: { id: labId } });
    return normalizeLabTimeZone(lab?.timezone);
  }

  async getOrdersTrend(labId: string, days: number): Promise<OrdersTrendPoint[]> {
    return this.ordersService.getOrdersTrend(labId, days);
  }

  async getStatistics(
    labId: string,
    startDate: Date,
    endDate: Date,
    filters: StatisticsFilterOptions = {},
  ): Promise<StatisticsDto> {
    const normalizedFilters = this.normalizeFilters(filters);
    const [orderStats, testsData, tatData, qualityData, unmatchedStats, instrumentWorkload] =
      await Promise.all([
        this.getOrderStatsForPeriod(labId, startDate, endDate, normalizedFilters),
        this.getTestsStatsForPeriod(labId, startDate, endDate, normalizedFilters),
        this.getTatForPeriod(labId, startDate, endDate, normalizedFilters),
        this.getQualityForPeriod(labId, startDate, endDate, normalizedFilters),
        this.unmatchedService.getStats(labId, startDate, endDate),
        this.unmatchedService.getCountByInstrumentInPeriod(labId, startDate, endDate),
      ]);

    return {
      orders: {
        total: orderStats.total,
        byStatus: orderStats.byStatus,
        byShift: orderStats.byShift,
      },
      profit: testsData.profit,
      revenue: orderStats.revenue,
      departmentTestTotal: testsData.departmentTestTotal,
      tests: {
        total: testsData.total,
        byDepartment: testsData.byDepartment,
        byTest: testsData.byTest,
        byShift: testsData.byShift,
      },
      tat: tatData,
      quality: qualityData,
      unmatched: unmatchedStats,
      instrumentWorkload,
    };
  }

  async generateStatisticsPdf(
    labId: string,
    startDate: Date,
    endDate: Date,
    filters: StatisticsFilterOptions = {},
  ): Promise<Buffer> {
    const normalizedFilters = this.normalizeFilters(filters);
    const [stats, lab, shift, department] = await Promise.all([
      this.getStatistics(labId, startDate, endDate, normalizedFilters),
      this.labRepo.findOne({ where: { id: labId } }),
      normalizedFilters.shiftId
        ? this.shiftRepo.findOne({ where: { id: normalizedFilters.shiftId, labId } })
        : Promise.resolve(null),
      normalizedFilters.departmentId
        ? this.departmentRepo.findOne({ where: { id: normalizedFilters.departmentId, labId } })
        : Promise.resolve(null),
    ]);

    const shiftLabel = shift ? shift.name || shift.code || shift.id : 'All shifts';
    const departmentLabel = department
      ? department.name || department.code || department.id
      : 'All departments';
    const startLabel = this.formatDateLabel(startDate);
    const endLabel = this.formatDateLabel(endDate);
    const generatedAt = new Date().toLocaleString();

    const departmentRows = [...(stats.tests.byDepartment ?? [])].sort(
      (a, b) => b.count - a.count || a.departmentName.localeCompare(b.departmentName),
    );
    const testRows = [...(stats.tests.byTest ?? [])].sort(
      (a, b) => b.count - a.count || a.testCode.localeCompare(b.testCode),
    );

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.font('Helvetica-Bold').fontSize(18).text('Statistics Report', { align: 'left' });
      doc.moveDown(0.25);
      doc.font('Helvetica').fontSize(11).fillColor('#222').text(`Lab: ${lab?.name || labId}`);
      doc.text(`Generated: ${generatedAt}`);
      doc.moveDown(0.5);

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111').text('Applied Filters');
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(10).fillColor('#333');
      doc.text(`Duration: ${startLabel} to ${endLabel}`);
      doc.text(`Shift: ${shiftLabel}`);
      doc.text(`Department: ${departmentLabel}`);
      doc.moveDown(0.8);

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111').text('KPI Summary');
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(10).fillColor('#333');
      doc.text(`Profit: ${this.formatCurrency(stats.profit)}`);
      doc.text(`Orders: ${stats.orders.total}`);
      doc.text(`Department test: ${stats.departmentTestTotal}`);
      doc.text(`Total test: ${stats.tests.total}`);
      doc.moveDown(0.8);

      this.drawTable(doc, 'Department tests', ['Department', 'Count'], departmentRows.map((row) => [
        row.departmentName,
        String(row.count),
      ]));

      this.drawTable(doc, 'Each test', ['Code', 'Test name', 'Count'], testRows.map((row) => [
        row.testCode,
        row.testName,
        String(row.count),
      ]));

      doc.end();
    });
  }

  private drawTable(
    doc: PdfKitDocument,
    title: string,
    headers: string[],
    rows: string[][],
  ): void {
    const left = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const rowHeight = 22;
    const colCount = Math.max(1, headers.length);
    const colWidth = usableWidth / colCount;

    this.ensurePdfSpace(doc, rowHeight * 2 + 20);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111').text(title);
    doc.moveDown(0.2);

    const drawRow = (cells: string[], header = false) => {
      this.ensurePdfSpace(doc, rowHeight + 2);
      const y = doc.y;
      let x = left;

      for (let i = 0; i < colCount; i++) {
        const value = cells[i] ?? '';
        if (header) {
          doc.save();
          doc.rect(x, y, colWidth, rowHeight).fill('#EFF3F8').stroke('#CBD5E1');
          doc.restore();
        } else {
          doc.rect(x, y, colWidth, rowHeight).stroke('#E2E8F0');
        }
        doc
          .font(header ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9)
          .fillColor('#111')
          .text(value, x + 4, y + 6, { width: colWidth - 8, height: rowHeight - 8, ellipsis: true });
        x += colWidth;
      }

      doc.y = y + rowHeight;
    };

    drawRow(headers, true);

    if (!rows.length) {
      drawRow(['No data']);
    } else {
      for (const row of rows) {
        drawRow(row);
      }
    }

    doc.moveDown(0.8);
  }

  private ensurePdfSpace(doc: PdfKitDocument, neededHeight: number): void {
    const bottomLimit = doc.page.height - doc.page.margins.bottom;
    if (doc.y + neededHeight <= bottomLimit) return;
    doc.addPage();
  }

  private formatCurrency(value: number): string {
    const numeric = Number.isFinite(value) ? value : 0;
    return `${Math.round(numeric).toLocaleString('en-US')} IQD`;
  }

  private formatDateLabel(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private normalizeFilters(filters: StatisticsFilterOptions): {
    shiftId: string | null;
    departmentId: string | null;
  } {
    return {
      shiftId: filters.shiftId?.trim() || null,
      departmentId: filters.departmentId?.trim() || null,
    };
  }

  private buildFilteredRootTestsQuery(
    labId: string,
    startDate: Date,
    endDate: Date,
    filters: { shiftId: string | null; departmentId: string | null },
  ) {
    const qb = this.orderTestRepo
      .createQueryBuilder('ot')
      .innerJoin('ot.sample', 's')
      .innerJoin('s.order', 'o')
      .innerJoin('ot.test', 't')
      .where('o.labId = :labId', { labId })
      .andWhere('o.registeredAt BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere('ot.parentOrderTestId IS NULL');

    if (filters.shiftId) {
      qb.andWhere('o.shiftId = :shiftId', { shiftId: filters.shiftId });
    }
    if (filters.departmentId) {
      qb.andWhere('t.departmentId = :departmentId', { departmentId: filters.departmentId });
    }
    return qb;
  }

  private buildFilteredOrdersQuery(
    labId: string,
    startDate: Date,
    endDate: Date,
    filters: { shiftId: string | null; departmentId: string | null },
  ) {
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .where('o.labId = :labId', { labId })
      .andWhere('o.registeredAt BETWEEN :startDate AND :endDate', { startDate, endDate });

    if (filters.shiftId) {
      qb.andWhere('o.shiftId = :shiftId', { shiftId: filters.shiftId });
    }

    qb.andWhere((subQueryBuilder) => {
      const sub = subQueryBuilder
        .subQuery()
        .select('1')
        .from(OrderTest, 'ot')
        .innerJoin('ot.sample', 's')
        .innerJoin('ot.test', 't')
        .where('s.orderId = o.id')
        .andWhere('ot.parentOrderTestId IS NULL');

      if (filters.departmentId) {
        sub.andWhere('t.departmentId = :departmentId');
      }
      return `EXISTS ${sub.getQuery()}`;
    });

    if (filters.departmentId) {
      qb.setParameter('departmentId', filters.departmentId);
    }

    return qb;
  }

  private async getOrderStatsForPeriod(
    labId: string,
    startDate: Date,
    endDate: Date,
    filters: { shiftId: string | null; departmentId: string | null },
  ): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byShift: { shiftId: string | null; shiftName: string; count: number }[];
    revenue: number;
  }> {
    const base = this.buildFilteredOrdersQuery(labId, startDate, endDate, filters);

    const [totalRow, statusRows, shiftRows, revenueRow] = await Promise.all([
      base.clone().select('COUNT(*)', 'count').getRawOne<{ count: string }>(),
      base
        .clone()
        .select('o.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('o.status')
        .getRawMany<{ status: string; count: string }>(),
      base
        .clone()
        .leftJoin('o.shift', 'shift')
        .select('o.shiftId', 'shiftId')
        .addSelect('MAX(COALESCE(shift.name, shift.code))', 'shiftName')
        .addSelect('COUNT(*)', 'count')
        .groupBy('o.shiftId')
        .getRawMany<{ shiftId: string | null; shiftName: string | null; count: string }>(),
      base
        .clone()
        .select('COALESCE(SUM(o.finalAmount), 0)', 'revenue')
        .getRawOne<{ revenue: string }>(),
    ]);

    const byStatus: Record<string, number> = {};
    for (const status of Object.values(OrderStatus)) {
      byStatus[status] = 0;
    }
    for (const row of statusRows) {
      byStatus[row.status] = parseInt(row.count, 10) || 0;
    }

    return {
      total: parseInt(totalRow?.count ?? '0', 10) || 0,
      byStatus,
      byShift: shiftRows.map((row) => ({
        shiftId: row.shiftId,
        shiftName: String(row.shiftName || row.shiftId || 'No shift'),
        count: parseInt(row.count, 10) || 0,
      })),
      revenue: parseFloat(revenueRow?.revenue ?? '0') || 0,
    };
  }

  private async getTestsStatsForPeriod(
    labId: string,
    startDate: Date,
    endDate: Date,
    filters: { shiftId: string | null; departmentId: string | null },
  ): Promise<{
    total: number;
    profit: number;
    departmentTestTotal: number;
    byDepartment: { departmentId: string | null; departmentName: string; count: number }[];
    byTest: { testId: string; testCode: string; testName: string; count: number }[];
    byShift: { shiftId: string | null; shiftName: string; count: number }[];
  }> {
    const base = this.buildFilteredRootTestsQuery(labId, startDate, endDate, filters);

    const [totalsRow, deptRows, testRows, shiftRows, deptOnlyTotalRow] = await Promise.all([
      base
        .clone()
        .select('COUNT(*)', 'total')
        .addSelect('COALESCE(SUM(ot.price), 0)', 'profit')
        .getRawOne<{ total: string; profit: string }>(),
      base
        .clone()
        .leftJoin('t.department', 'd')
        .select('t.departmentId', 'departmentId')
        .addSelect('MAX(COALESCE(d.name, d.code))', 'departmentName')
        .addSelect('COUNT(*)', 'count')
        .groupBy('t.departmentId')
        .getRawMany<{ departmentId: string | null; departmentName: string | null; count: string }>(),
      base
        .clone()
        .select('t.id', 'testId')
        .addSelect('t.code', 'testCode')
        .addSelect('MAX(t.name)', 'testName')
        .addSelect('COUNT(*)', 'count')
        .groupBy('t.id')
        .addGroupBy('t.code')
        .getRawMany<{ testId: string; testCode: string | null; testName: string | null; count: string }>(),
      base
        .clone()
        .leftJoin('o.shift', 'shift')
        .select('o.shiftId', 'shiftId')
        .addSelect('MAX(COALESCE(shift.name, shift.code))', 'shiftName')
        .addSelect('COUNT(*)', 'count')
        .groupBy('o.shiftId')
        .getRawMany<{ shiftId: string | null; shiftName: string | null; count: string }>(),
      filters.departmentId
        ? Promise.resolve(null)
        : base
          .clone()
          .andWhere('t.departmentId IS NOT NULL')
          .select('COUNT(*)', 'count')
          .getRawOne<{ count: string }>(),
    ]);

    const total = parseInt(totalsRow?.total ?? '0', 10) || 0;
    const profit = parseFloat(totalsRow?.profit ?? '0') || 0;

    const byDepartment = deptRows.map((row) => ({
      departmentId: row.departmentId,
      departmentName: String(row.departmentName || row.departmentId || 'Unassigned'),
      count: parseInt(row.count, 10) || 0,
    }));

    const byTest = testRows.map((row) => ({
      testId: row.testId,
      testCode: String(row.testCode ?? ''),
      testName: String(row.testName ?? row.testCode ?? ''),
      count: parseInt(row.count, 10) || 0,
    }));

    const byShift = shiftRows.map((row) => ({
      shiftId: row.shiftId,
      shiftName: String(row.shiftName || row.shiftId || 'No shift'),
      count: parseInt(row.count, 10) || 0,
    }));

    const departmentTestTotal = filters.departmentId
      ? total
      : parseInt(deptOnlyTotalRow?.count ?? '0', 10) || 0;

    return {
      total,
      profit,
      departmentTestTotal,
      byDepartment,
      byTest,
      byShift,
    };
  }

  private async getTatForPeriod(
    labId: string,
    startDate: Date,
    endDate: Date,
    filters: { shiftId: string | null; departmentId: string | null },
  ): Promise<{
    medianMinutes: number | null;
    p95Minutes: number | null;
    withinTargetCount: number;
    withinTargetTotal: number;
    targetMinutes: number;
  }> {
    const qb = this.orderTestRepo
      .createQueryBuilder('ot')
      .innerJoin('ot.sample', 's')
      .innerJoin('s.order', 'o')
      .innerJoin('ot.test', 't')
      .select('EXTRACT(EPOCH FROM (ot.verifiedAt - o.registeredAt)) / 60', 'minutes')
      .where('o.labId = :labId', { labId })
      .andWhere('ot.verifiedAt IS NOT NULL')
      .andWhere('ot.parentOrderTestId IS NULL')
      .andWhere('o.registeredAt BETWEEN :startDate AND :endDate', { startDate, endDate });

    if (filters.shiftId) {
      qb.andWhere('o.shiftId = :shiftId', { shiftId: filters.shiftId });
    }
    if (filters.departmentId) {
      qb.andWhere('t.departmentId = :departmentId', { departmentId: filters.departmentId });
    }

    const rows = await qb.getRawMany<{ minutes: string }>();

    const minutes = rows
      .map((row) => parseFloat(row.minutes))
      .filter((value) => Number.isFinite(value) && value >= 0);
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
    const medianMinutes =
      n % 2 === 1
        ? minutes[Math.floor(n / 2)]
        : (minutes[n / 2 - 1] + minutes[n / 2]) / 2;
    const p95Idx = Math.min(n - 1, Math.ceil(n * 0.95) - 1);
    const p95Minutes = minutes[p95Idx];
    const withinTargetCount = minutes.filter((value) => value <= TAT_TARGET_MINUTES).length;

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
    filters: { shiftId: string | null; departmentId: string | null },
  ): Promise<{ abnormalCount: number; criticalCount: number; totalVerified: number }> {
    const base = this.orderTestRepo
      .createQueryBuilder('ot')
      .innerJoin('ot.sample', 's')
      .innerJoin('s.order', 'o')
      .innerJoin('ot.test', 't')
      .where('o.labId = :labId', { labId })
      .andWhere('ot.parentOrderTestId IS NULL')
      .andWhere('ot.status = :verified', { verified: OrderTestStatus.VERIFIED })
      .andWhere('o.registeredAt BETWEEN :startDate AND :endDate', { startDate, endDate });

    if (filters.shiftId) {
      base.andWhere('o.shiftId = :shiftId', { shiftId: filters.shiftId });
    }
    if (filters.departmentId) {
      base.andWhere('t.departmentId = :departmentId', { departmentId: filters.departmentId });
    }

    const [abnormalCount, criticalCount, totalVerified] = await Promise.all([
      base
        .clone()
        .andWhere('ot.flag IN (:...flags)', { flags: [ResultFlag.HIGH, ResultFlag.LOW] })
        .getCount(),
      base
        .clone()
        .andWhere('ot.flag IN (:...flags)', {
          flags: [ResultFlag.CRITICAL_HIGH, ResultFlag.CRITICAL_LOW],
        })
        .getCount(),
      base.clone().getCount(),
    ]);

    return { abnormalCount, criticalCount, totalVerified };
  }
}
