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
const platform_setting_entity_1 = require("../entities/platform-setting.entity");
const shift_entity_1 = require("../entities/shift.entity");
const department_entity_1 = require("../entities/department.entity");
const sub_lab_entity_1 = require("../entities/sub-lab.entity");
const orders_service_1 = require("../orders/orders.service");
const unmatched_results_service_1 = require("../unmatched/unmatched-results.service");
const lab_timezone_util_1 = require("../database/lab-timezone.util");
const PDFDocument = require('pdfkit');
const GLOBAL_DASHBOARD_ANNOUNCEMENT_KEY = 'dashboard.announcement.all_labs';
const TAT_TARGET_MINUTES = 60;
let DashboardService = class DashboardService {
    constructor(patientRepo, orderTestRepo, orderRepo, labRepo, platformSettingRepo, shiftRepo, departmentRepo, subLabRepo, ordersService, unmatchedService) {
        this.patientRepo = patientRepo;
        this.orderTestRepo = orderTestRepo;
        this.orderRepo = orderRepo;
        this.labRepo = labRepo;
        this.platformSettingRepo = platformSettingRepo;
        this.shiftRepo = shiftRepo;
        this.departmentRepo = departmentRepo;
        this.subLabRepo = subLabRepo;
        this.ordersService = ordersService;
        this.unmatchedService = unmatchedService;
    }
    async getKpis(labId) {
        const [totalPatients, ordersToday, pendingVerification, avgTatHours] = await Promise.all([
            this.getTotalPatientsCount(labId),
            this.ordersService.getOrdersTodayCount(labId),
            this.orderTestRepo
                .createQueryBuilder('ot')
                .innerJoin('ot.sample', 's')
                .innerJoin('s.order', 'o')
                .where('o.labId = :labId', { labId })
                .andWhere('o.status != :cancelled', { cancelled: order_entity_1.OrderStatus.CANCELLED })
                .andWhere('ot.parentOrderTestId IS NULL')
                .andWhere('ot.status = :status', { status: order_test_entity_1.OrderTestStatus.COMPLETED })
                .getCount(),
            this.getRecentAverageTatHours(labId, 7),
        ]);
        return {
            ordersToday,
            pendingVerification,
            avgTatHours,
            totalPatients,
        };
    }
    async getTotalPatientsCount(labId) {
        const row = await this.orderRepo
            .createQueryBuilder('o')
            .select('COUNT(DISTINCT("o"."patientId"))', 'count')
            .where('o.labId = :labId', { labId })
            .getRawOne();
        const rawCount = row?.count;
        const parsedCount = typeof rawCount === 'number'
            ? rawCount
            : typeof rawCount === 'string'
                ? Number.parseInt(rawCount, 10)
                : Number.NaN;
        return Number.isFinite(parsedCount) && parsedCount >= 0 ? parsedCount : 0;
    }
    async getLabTimeZone(labId) {
        const lab = await this.labRepo.findOne({ where: { id: labId } });
        return (0, lab_timezone_util_1.normalizeLabTimeZone)(lab?.timezone);
    }
    async getAnnouncement(labId) {
        const [lab, globalSetting] = await Promise.all([
            this.labRepo.findOne({
                where: { id: labId },
                select: {
                    id: true,
                    dashboardAnnouncementText: true,
                },
            }),
            this.platformSettingRepo.findOne({
                where: { key: GLOBAL_DASHBOARD_ANNOUNCEMENT_KEY },
            }),
        ]);
        const labText = this.normalizeAnnouncementText(lab?.dashboardAnnouncementText);
        if (labText) {
            return { text: labText, source: 'LAB' };
        }
        const globalText = this.normalizeAnnouncementText(globalSetting?.valueText);
        if (globalText) {
            return { text: globalText, source: 'GLOBAL' };
        }
        return { text: null, source: 'NONE' };
    }
    async getOrdersTrend(labId, days) {
        return this.ordersService.getOrdersTrend(labId, days);
    }
    async getStatistics(labId, startDate, endDate, filters = {}) {
        const normalizedFilters = this.normalizeFilters(filters);
        const [orderStats, testsData, tatData, qualityData, subLabBilling, unmatchedStats, instrumentWorkload,] = await Promise.all([
            this.getOrderStatsForPeriod(labId, startDate, endDate, normalizedFilters),
            this.getTestsStatsForPeriod(labId, startDate, endDate, normalizedFilters),
            this.getTatForPeriod(labId, startDate, endDate, normalizedFilters),
            this.getQualityForPeriod(labId, startDate, endDate, normalizedFilters),
            this.getSubLabBillingForPeriod(labId, startDate, endDate, normalizedFilters),
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
            subLabBilling,
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
        const sourceLabel = this.getSourceTypeLabel(normalizedFilters.sourceType);
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
            doc.text(`Source: ${sourceLabel}`);
            doc.moveDown(0.8);
            doc.font('Helvetica-Bold').fontSize(12).fillColor('#111').text('KPI Summary');
            doc.moveDown(0.2);
            doc.font('Helvetica').fontSize(10).fillColor('#333');
            doc.text(`Profit: ${this.formatCurrency(stats.profit)}`);
            doc.text(`Orders: ${stats.orders.total}`);
            doc.text(`Department test: ${stats.departmentTestTotal}`);
            doc.text(`Total test: ${stats.tests.total}`);
            doc.moveDown(0.8);
            const payableRows = [
                [
                    'All',
                    String(stats.subLabBilling.billableRootTests),
                    String(stats.subLabBilling.verifiedRootTests),
                    String(stats.subLabBilling.completedRootTests),
                    this.formatCurrency(stats.subLabBilling.billableAmount),
                ],
            ];
            if (stats.subLabBilling.activeSourceType !== 'SUB_LAB') {
                payableRows.push([
                    'In-house',
                    String(stats.subLabBilling.inHouse.billableRootTests),
                    String(stats.subLabBilling.inHouse.verifiedRootTests),
                    String(stats.subLabBilling.inHouse.completedRootTests),
                    this.formatCurrency(stats.subLabBilling.inHouse.billableAmount),
                ]);
            }
            const subLabRows = [...(stats.subLabBilling.bySubLab ?? [])].sort((a, b) => b.billableAmount - a.billableAmount || a.subLabName.localeCompare(b.subLabName));
            if (stats.subLabBilling.activeSourceType !== 'IN_HOUSE') {
                payableRows.push(...subLabRows.map((row) => [
                    row.subLabName,
                    String(row.billableRootTests),
                    String(row.verifiedRootTests),
                    String(row.completedRootTests),
                    this.formatCurrency(row.billableAmount),
                ]));
            }
            this.drawTable(doc, 'Payable breakdown', ['Source', 'Billable tests', 'Verified', 'Completed', 'Amount'], payableRows);
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
        const sourceType = filters.sourceType ?? 'ALL';
        return {
            shiftId: filters.shiftId?.trim() || null,
            departmentId: filters.departmentId?.trim() || null,
            sourceType: sourceType === 'IN_HOUSE' || sourceType === 'SUB_LAB' ? sourceType : 'ALL',
            subLabId: filters.subLabId?.trim() || null,
        };
    }
    buildFilteredRootTestsQuery(labId, startDate, endDate, filters) {
        const qb = this.orderTestRepo
            .createQueryBuilder('ot')
            .innerJoin('ot.sample', 's')
            .innerJoin('s.order', 'o')
            .innerJoin('ot.test', 't')
            .where('o.labId = :labId', { labId })
            .andWhere('o.status != :cancelledOrderStatus', {
            cancelledOrderStatus: order_entity_1.OrderStatus.CANCELLED,
        })
            .andWhere('o.registeredAt BETWEEN :startDate AND :endDate', { startDate, endDate })
            .andWhere('ot.parentOrderTestId IS NULL');
        if (filters.shiftId) {
            qb.andWhere('o.shiftId = :shiftId', { shiftId: filters.shiftId });
        }
        if (filters.departmentId) {
            qb.andWhere('t.departmentId = :departmentId', { departmentId: filters.departmentId });
        }
        this.applySourceTypeFilter(qb, filters.sourceType);
        return this.applySpecificSubLabFilter(qb, filters.subLabId);
    }
    buildFilteredOrdersQuery(labId, startDate, endDate, filters) {
        const qb = this.orderRepo
            .createQueryBuilder('o')
            .where('o.labId = :labId', { labId })
            .andWhere('o.status != :cancelledOrderStatus', {
            cancelledOrderStatus: order_entity_1.OrderStatus.CANCELLED,
        })
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
        this.applySourceTypeFilter(qb, filters.sourceType);
        return this.applySpecificSubLabFilter(qb, filters.subLabId);
    }
    async getOrderStatsForPeriod(labId, startDate, endDate, filters) {
        const base = this.buildFilteredOrdersQuery(labId, startDate, endDate, filters);
        const statusBase = this.orderRepo
            .createQueryBuilder('o')
            .where('o.labId = :labId', { labId })
            .andWhere('o.registeredAt BETWEEN :startDate AND :endDate', { startDate, endDate });
        if (filters.shiftId) {
            statusBase.andWhere('o.shiftId = :shiftId', { shiftId: filters.shiftId });
        }
        this.applySourceTypeFilter(statusBase, filters.sourceType);
        this.applySpecificSubLabFilter(statusBase, filters.subLabId);
        statusBase.andWhere((subQueryBuilder) => {
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
            statusBase.setParameter('departmentId', filters.departmentId);
        }
        const [totalRow, statusRows, shiftRows, revenueRow] = await Promise.all([
            base.clone().select('COUNT(*)', 'count').getRawOne(),
            statusBase
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
            .andWhere('o.status != :cancelled', { cancelled: order_entity_1.OrderStatus.CANCELLED })
            .andWhere('ot.verifiedAt IS NOT NULL')
            .andWhere('ot.parentOrderTestId IS NULL')
            .andWhere('o.registeredAt BETWEEN :startDate AND :endDate', { startDate, endDate });
        if (filters.shiftId) {
            qb.andWhere('o.shiftId = :shiftId', { shiftId: filters.shiftId });
        }
        if (filters.departmentId) {
            qb.andWhere('t.departmentId = :departmentId', { departmentId: filters.departmentId });
        }
        this.applySourceTypeFilter(qb, filters.sourceType);
        this.applySpecificSubLabFilter(qb, filters.subLabId);
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
    async getRecentAverageTatHours(labId, days) {
        const timeZone = await this.getLabTimeZone(labId);
        const todayDateKey = (0, lab_timezone_util_1.formatDateKeyForTimeZone)(new Date(), timeZone);
        const startDateKey = (0, lab_timezone_util_1.addDaysToDateKey)(todayDateKey, -(Math.max(1, days) - 1));
        const { startDate } = (0, lab_timezone_util_1.getUtcRangeForLabDate)(startDateKey, timeZone);
        const { endDate } = (0, lab_timezone_util_1.getUtcRangeForLabDate)(todayDateKey, timeZone);
        const row = await this.orderTestRepo
            .createQueryBuilder('ot')
            .innerJoin('ot.sample', 's')
            .innerJoin('s.order', 'o')
            .select('AVG(EXTRACT(EPOCH FROM (ot.verifiedAt - o.registeredAt)) / 3600.0)', 'avgHours')
            .where('o.labId = :labId', { labId })
            .andWhere('o.status != :cancelled', { cancelled: order_entity_1.OrderStatus.CANCELLED })
            .andWhere('ot.verifiedAt IS NOT NULL')
            .andWhere('ot.parentOrderTestId IS NULL')
            .andWhere('o.registeredAt BETWEEN :startDate AND :endDate', { startDate, endDate })
            .getRawOne();
        const avgHoursRaw = row?.avgHours;
        const avgHours = avgHoursRaw === null || avgHoursRaw === undefined ? Number.NaN : parseFloat(avgHoursRaw);
        if (!Number.isFinite(avgHours) || avgHours < 0) {
            return null;
        }
        return Math.round(avgHours * 10) / 10;
    }
    async getQualityForPeriod(labId, startDate, endDate, filters) {
        const base = this.orderTestRepo
            .createQueryBuilder('ot')
            .innerJoin('ot.sample', 's')
            .innerJoin('s.order', 'o')
            .innerJoin('ot.test', 't')
            .where('o.labId = :labId', { labId })
            .andWhere('o.status != :cancelled', { cancelled: order_entity_1.OrderStatus.CANCELLED })
            .andWhere('ot.parentOrderTestId IS NULL')
            .andWhere('ot.status = :verified', { verified: order_test_entity_1.OrderTestStatus.VERIFIED })
            .andWhere('o.registeredAt BETWEEN :startDate AND :endDate', { startDate, endDate });
        if (filters.shiftId) {
            base.andWhere('o.shiftId = :shiftId', { shiftId: filters.shiftId });
        }
        if (filters.departmentId) {
            base.andWhere('t.departmentId = :departmentId', { departmentId: filters.departmentId });
        }
        this.applySourceTypeFilter(base, filters.sourceType);
        this.applySpecificSubLabFilter(base, filters.subLabId);
        const [abnormalCount, totalVerified] = await Promise.all([
            base
                .clone()
                .andWhere('ot.flag IN (:...flags)', { flags: [order_test_entity_1.ResultFlag.HIGH, order_test_entity_1.ResultFlag.LOW] })
                .getCount(),
            base.clone().getCount(),
        ]);
        return { abnormalCount, totalVerified };
    }
    normalizeAnnouncementText(value) {
        const trimmed = String(value ?? '').trim();
        return trimmed || null;
    }
    async getSubLabBillingForPeriod(labId, startDate, endDate, filters) {
        const filteredBase = this.buildFilteredBillableRootTestsQuery(labId, startDate, endDate, filters);
        const filteredStatusBase = filteredBase.clone();
        const inHouseBase = filteredBase.clone().andWhere('o.sourceSubLabId IS NULL');
        const inHouseStatusBase = inHouseBase.clone();
        const subLabBreakdownBase = filteredBase.clone().andWhere('o.sourceSubLabId IS NOT NULL');
        const [summary, inHouseSummary, statusCountMap, inHouseStatusCountMap, byTestRows, bySubLabRows, activeSubLabs,] = await Promise.all([
            this.getBillingSummaryForQuery(filteredBase),
            this.getBillingSummaryForQuery(inHouseBase),
            this.getBillingStatusCountMap(filteredStatusBase),
            this.getBillingStatusCountMap(inHouseStatusBase),
            filteredBase
                .clone()
                .select('t.id', 'testId')
                .addSelect('t.code', 'testCode')
                .addSelect('MAX(t.name)', 'testName')
                .addSelect('COUNT(*)', 'count')
                .addSelect('COALESCE(SUM(ot.price), 0)', 'amount')
                .groupBy('t.id')
                .addGroupBy('t.code')
                .getRawMany(),
            subLabBreakdownBase
                .clone()
                .leftJoin('o.sourceSubLab', 'subLab')
                .select('o.sourceSubLabId', 'subLabId')
                .addSelect('MAX(subLab.name)', 'subLabName')
                .addSelect('COUNT(*)', 'count')
                .addSelect('COALESCE(SUM(ot.price), 0)', 'amount')
                .addSelect('SUM(CASE WHEN ot.status = :completedStatus THEN 1 ELSE 0 END)', 'completedCount')
                .addSelect('SUM(CASE WHEN ot.status = :verifiedStatus THEN 1 ELSE 0 END)', 'verifiedCount')
                .setParameters({
                completedStatus: order_test_entity_1.OrderTestStatus.COMPLETED,
                verifiedStatus: order_test_entity_1.OrderTestStatus.VERIFIED,
            })
                .groupBy('o.sourceSubLabId')
                .getRawMany(),
            this.subLabRepo.find({
                where: {
                    labId,
                    isActive: true,
                },
                select: {
                    id: true,
                    name: true,
                },
                order: {
                    name: 'ASC',
                },
            }),
        ]);
        const bySubLabRowMap = new Map(bySubLabRows.map((row) => [
            row.subLabId,
            {
                subLabId: row.subLabId,
                subLabName: String(row.subLabName ?? row.subLabId ?? 'Unknown sub lab'),
                billableRootTests: parseInt(row.count, 10) || 0,
                billableAmount: parseFloat(row.amount ?? '0') || 0,
                completedRootTests: parseInt(row.completedCount, 10) || 0,
                verifiedRootTests: parseInt(row.verifiedCount, 10) || 0,
            },
        ]));
        const configuredSubLabRows = activeSubLabs.map((subLab) => ({
            subLabId: subLab.id,
            subLabName: subLab.name,
            billableRootTests: bySubLabRowMap.get(subLab.id)?.billableRootTests ?? 0,
            billableAmount: bySubLabRowMap.get(subLab.id)?.billableAmount ?? 0,
            completedRootTests: bySubLabRowMap.get(subLab.id)?.completedRootTests ?? 0,
            verifiedRootTests: bySubLabRowMap.get(subLab.id)?.verifiedRootTests ?? 0,
        }));
        const fallbackSubLabRows = [...bySubLabRowMap.values()].filter((row) => !activeSubLabs.some((subLab) => subLab.id === row.subLabId));
        return {
            activeSourceType: filters.sourceType,
            billableRootTests: summary.billableRootTests,
            billableAmount: summary.billableAmount,
            completedRootTests: statusCountMap.get(order_test_entity_1.OrderTestStatus.COMPLETED) ?? 0,
            verifiedRootTests: statusCountMap.get(order_test_entity_1.OrderTestStatus.VERIFIED) ?? 0,
            inHouse: {
                billableRootTests: inHouseSummary.billableRootTests,
                billableAmount: inHouseSummary.billableAmount,
                completedRootTests: inHouseStatusCountMap.get(order_test_entity_1.OrderTestStatus.COMPLETED) ?? 0,
                verifiedRootTests: inHouseStatusCountMap.get(order_test_entity_1.OrderTestStatus.VERIFIED) ?? 0,
            },
            bySubLab: [...configuredSubLabRows, ...fallbackSubLabRows],
            byTest: byTestRows.map((row) => ({
                testId: row.testId,
                testCode: String(row.testCode ?? ''),
                testName: String(row.testName ?? row.testCode ?? ''),
                count: parseInt(row.count, 10) || 0,
                amount: parseFloat(row.amount ?? '0') || 0,
            })),
        };
    }
    buildFilteredBillableRootTestsQuery(labId, startDate, endDate, filters) {
        const qb = this.orderTestRepo
            .createQueryBuilder('ot')
            .innerJoin('ot.sample', 's')
            .innerJoin('s.order', 'o')
            .innerJoin('ot.test', 't')
            .where('o.labId = :labId', { labId })
            .andWhere('o.status != :cancelled', { cancelled: order_entity_1.OrderStatus.CANCELLED })
            .andWhere('ot.parentOrderTestId IS NULL')
            .andWhere('ot.status IN (:...billableStatuses)', {
            billableStatuses: [order_test_entity_1.OrderTestStatus.COMPLETED, order_test_entity_1.OrderTestStatus.VERIFIED],
        })
            .andWhere('COALESCE(ot.verifiedAt, ot.resultedAt) BETWEEN :startDate AND :endDate', {
            startDate,
            endDate,
        });
        if (filters.shiftId) {
            qb.andWhere('o.shiftId = :shiftId', { shiftId: filters.shiftId });
        }
        if (filters.departmentId) {
            qb.andWhere('t.departmentId = :departmentId', { departmentId: filters.departmentId });
        }
        this.applySourceTypeFilter(qb, filters.sourceType);
        return this.applySpecificSubLabFilter(qb, filters.subLabId);
    }
    async getBillingSummaryForQuery(base) {
        const row = await base
            .clone()
            .select('COUNT(*)', 'count')
            .addSelect('COALESCE(SUM(ot.price), 0)', 'amount')
            .getRawOne();
        return {
            billableRootTests: parseInt(row?.count ?? '0', 10) || 0,
            billableAmount: parseFloat(row?.amount ?? '0') || 0,
            completedRootTests: 0,
            verifiedRootTests: 0,
        };
    }
    async getBillingStatusCountMap(base) {
        const rows = await base
            .clone()
            .select('ot.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .groupBy('ot.status')
            .getRawMany();
        return new Map(rows.map((row) => [row.status, parseInt(row.count, 10) || 0]));
    }
    applySourceTypeFilter(qb, sourceType) {
        if (sourceType === 'IN_HOUSE') {
            return qb.andWhere('o.sourceSubLabId IS NULL');
        }
        if (sourceType === 'SUB_LAB') {
            return qb.andWhere('o.sourceSubLabId IS NOT NULL');
        }
        return qb;
    }
    applySpecificSubLabFilter(qb, subLabId) {
        if (subLabId) {
            return qb.andWhere('o.sourceSubLabId = :subLabId', { subLabId });
        }
        return qb;
    }
    getSourceTypeLabel(sourceType) {
        if (sourceType === 'IN_HOUSE')
            return 'In-house';
        if (sourceType === 'SUB_LAB')
            return 'Sub-lab';
        return 'All';
    }
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(patient_entity_1.Patient)),
    __param(1, (0, typeorm_1.InjectRepository)(order_test_entity_1.OrderTest)),
    __param(2, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(3, (0, typeorm_1.InjectRepository)(lab_entity_1.Lab)),
    __param(4, (0, typeorm_1.InjectRepository)(platform_setting_entity_1.PlatformSetting)),
    __param(5, (0, typeorm_1.InjectRepository)(shift_entity_1.Shift)),
    __param(6, (0, typeorm_1.InjectRepository)(department_entity_1.Department)),
    __param(7, (0, typeorm_1.InjectRepository)(sub_lab_entity_1.SubLab)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        orders_service_1.OrdersService,
        unmatched_results_service_1.UnmatchedResultsService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map