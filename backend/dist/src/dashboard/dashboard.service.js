"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const patient_entity_1 = require("../entities/patient.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const order_entity_1 = require("../entities/order.entity");
const lab_entity_1 = require("../entities/lab.entity");
const shift_entity_1 = require("../entities/shift.entity");
const department_entity_1 = require("../entities/department.entity");
const orders_service_1 = require("../orders/orders.service");
const unmatched_results_service_1 = require("../unmatched/unmatched-results.service");
const lab_timezone_util_1 = require("../database/lab-timezone.util");
const PDFDocument = require('pdfkit');
const TAT_TARGET_MINUTES = 60;
let DashboardService = class DashboardService {
    constructor(patientRepo, orderTestRepo, orderRepo, labRepo, shiftRepo, departmentRepo, ordersService, unmatchedService) {
        this.patientRepo = patientRepo;
        this.orderTestRepo = orderTestRepo;
        this.orderRepo = orderRepo;
        this.labRepo = labRepo;
        this.shiftRepo = shiftRepo;
        this.departmentRepo = departmentRepo;
        this.ordersService = ordersService;
        this.unmatchedService = unmatchedService;
    }
    async getKpis(labId) {
        const totalPatients = await this.patientRepo.count();
        const ordersToday = await this.ordersService.getOrdersTodayCount(labId);
        const pendingVerification = await this.orderTestRepo
            .createQueryBuilder('ot')
            .innerJoin('ot.sample', 's')
            .innerJoin('s.order', 'o')
            .where('o.labId = :labId', { labId })
            .andWhere('ot.parentOrderTestId IS NULL')
            .andWhere('ot.status = :status', { status: order_test_entity_1.OrderTestStatus.COMPLETED })
            .getCount();
        const criticalAlerts = await this.orderTestRepo
            .createQueryBuilder('ot')
            .innerJoin('ot.sample', 's')
            .innerJoin('s.order', 'o')
            .where('o.labId = :labId', { labId })
            .andWhere('ot.parentOrderTestId IS NULL')
            .andWhere('ot.flag IN (:...flags)', { flags: [order_test_entity_1.ResultFlag.CRITICAL_HIGH, order_test_entity_1.ResultFlag.CRITICAL_LOW] })
            .andWhere('ot.status != :verified', { verified: order_test_entity_1.OrderTestStatus.VERIFIED })
            .getCount();
        return {
            ordersToday,
            pendingVerification,
            criticalAlerts,
            avgTatHours: null,
            totalPatients,
        };
    }
    async getLabTimeZone(labId) {
        const lab = await this.labRepo.findOne({ where: { id: labId } });
        return (0, lab_timezone_util_1.normalizeLabTimeZone)(lab?.timezone);
    }
    async getOrdersTrend(labId, days) {
        return this.ordersService.getOrdersTrend(labId, days);
    }
    async getStatistics(labId, startDate, endDate, filters = {}) {
        const normalizedFilters = this.normalizeFilters(filters);
        const [orderStats, testsData, tatData, qualityData, unmatchedStats, instrumentWorkload] = await Promise.all([
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
    async generateStatisticsPdf(labId, startDate, endDate, filters = {}) {
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
        const departmentRows = [...(stats.tests.byDepartment ?? [])].sort((a, b) => b.count - a.count || a.departmentName.localeCompare(b.departmentName));
        const testRows = [...(stats.tests.byTest ?? [])].sort((a, b) => b.count - a.count || a.testCode.localeCompare(b.testCode));
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ size: 'A4', margin: 40 });
            const chunks = [];
            doc.on('data', (chunk) => chunks.push(chunk));
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
    drawTable(doc, title, headers, rows) {
        const left = doc.page.margins.left;
        const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const rowHeight = 22;
        const colCount = Math.max(1, headers.length);
        const colWidth = usableWidth / colCount;
        this.ensurePdfSpace(doc, rowHeight * 2 + 20);
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111').text(title);
        doc.moveDown(0.2);
        const drawRow = (cells, header = false) => {
            this.ensurePdfSpace(doc, rowHeight + 2);
            const y = doc.y;
            let x = left;
            for (let i = 0; i < colCount; i++) {
                const value = cells[i] ?? '';
                if (header) {
                    doc.save();
                    doc.rect(x, y, colWidth, rowHeight).fill('#EFF3F8').stroke('#CBD5E1');
                    doc.restore();
                }
                else {
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
        }
        else {
            for (const row of rows) {
                drawRow(row);
            }
        }
        doc.moveDown(0.8);
    }
    ensurePdfSpace(doc, neededHeight) {
        const bottomLimit = doc.page.height - doc.page.margins.bottom;
        if (doc.y + neededHeight <= bottomLimit)
            return;
        doc.addPage();
    }
    formatCurrency(value) {
        const numeric = Number.isFinite(value) ? value : 0;
        return `${Math.round(numeric).toLocaleString('en-US')} IQD`;
    }
    formatDateLabel(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    normalizeFilters(filters) {
        return {
            shiftId: filters.shiftId?.trim() || null,
            departmentId: filters.departmentId?.trim() || null,
        };
    }
    buildFilteredRootTestsQuery(labId, startDate, endDate, filters) {
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
    buildFilteredOrdersQuery(labId, startDate, endDate, filters) {
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
                .from(order_test_entity_1.OrderTest, 'ot')
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
    async getOrderStatsForPeriod(labId, startDate, endDate, filters) {
        const base = this.buildFilteredOrdersQuery(labId, startDate, endDate, filters);
        const [totalRow, statusRows, shiftRows, revenueRow] = await Promise.all([
            base.clone().select('COUNT(*)', 'count').getRawOne(),
            base
                .clone()
                .select('o.status', 'status')
                .addSelect('COUNT(*)', 'count')
                .groupBy('o.status')
                .getRawMany(),
            base
                .clone()
                .leftJoin('o.shift', 'shift')
                .select('o.shiftId', 'shiftId')
                .addSelect('MAX(COALESCE(shift.name, shift.code))', 'shiftName')
                .addSelect('COUNT(*)', 'count')
                .groupBy('o.shiftId')
                .getRawMany(),
            base
                .clone()
                .select('COALESCE(SUM(o.finalAmount), 0)', 'revenue')
                .getRawOne(),
        ]);
        const byStatus = {};
        for (const status of Object.values(order_entity_1.OrderStatus)) {
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
    async getTestsStatsForPeriod(labId, startDate, endDate, filters) {
        const base = this.buildFilteredRootTestsQuery(labId, startDate, endDate, filters);
        const [totalsRow, deptRows, testRows, shiftRows, deptOnlyTotalRow] = await Promise.all([
            base
                .clone()
                .select('COUNT(*)', 'total')
                .addSelect('COALESCE(SUM(ot.price), 0)', 'profit')
                .getRawOne(),
            base
                .clone()
                .leftJoin('t.department', 'd')
                .select('t.departmentId', 'departmentId')
                .addSelect('MAX(COALESCE(d.name, d.code))', 'departmentName')
                .addSelect('COUNT(*)', 'count')
                .groupBy('t.departmentId')
                .getRawMany(),
            base
                .clone()
                .select('t.id', 'testId')
                .addSelect('t.code', 'testCode')
                .addSelect('MAX(t.name)', 'testName')
                .addSelect('COUNT(*)', 'count')
                .groupBy('t.id')
                .addGroupBy('t.code')
                .getRawMany(),
            base
                .clone()
                .leftJoin('o.shift', 'shift')
                .select('o.shiftId', 'shiftId')
                .addSelect('MAX(COALESCE(shift.name, shift.code))', 'shiftName')
                .addSelect('COUNT(*)', 'count')
                .groupBy('o.shiftId')
                .getRawMany(),
            filters.departmentId
                ? Promise.resolve(null)
                : base
                    .clone()
                    .andWhere('t.departmentId IS NOT NULL')
                    .select('COUNT(*)', 'count')
                    .getRawOne(),
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
    async getTatForPeriod(labId, startDate, endDate, filters) {
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
        const rows = await qb.getRawMany();
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
        const medianMinutes = n % 2 === 1
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
    async getQualityForPeriod(labId, startDate, endDate, filters) {
        const base = this.orderTestRepo
            .createQueryBuilder('ot')
            .innerJoin('ot.sample', 's')
            .innerJoin('s.order', 'o')
            .innerJoin('ot.test', 't')
            .where('o.labId = :labId', { labId })
            .andWhere('ot.parentOrderTestId IS NULL')
            .andWhere('ot.status = :verified', { verified: order_test_entity_1.OrderTestStatus.VERIFIED })
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
                .andWhere('ot.flag IN (:...flags)', { flags: [order_test_entity_1.ResultFlag.HIGH, order_test_entity_1.ResultFlag.LOW] })
                .getCount(),
            base
                .clone()
                .andWhere('ot.flag IN (:...flags)', {
                flags: [order_test_entity_1.ResultFlag.CRITICAL_HIGH, order_test_entity_1.ResultFlag.CRITICAL_LOW],
            })
                .getCount(),
            base.clone().getCount(),
        ]);
        return { abnormalCount, criticalCount, totalVerified };
    }
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(patient_entity_1.Patient)),
    __param(1, (0, typeorm_1.InjectRepository)(order_test_entity_1.OrderTest)),
    __param(2, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(3, (0, typeorm_1.InjectRepository)(lab_entity_1.Lab)),
    __param(4, (0, typeorm_1.InjectRepository)(shift_entity_1.Shift)),
    __param(5, (0, typeorm_1.InjectRepository)(department_entity_1.Department)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        orders_service_1.OrdersService,
        unmatched_results_service_1.UnmatchedResultsService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map