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
const orders_service_1 = require("../orders/orders.service");
const unmatched_results_service_1 = require("../unmatched/unmatched-results.service");
const TAT_TARGET_MINUTES = 60;
let DashboardService = class DashboardService {
    constructor(patientRepo, orderTestRepo, ordersService, unmatchedService) {
        this.patientRepo = patientRepo;
        this.orderTestRepo = orderTestRepo;
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
            .andWhere('ot.status = :status', { status: order_test_entity_1.OrderTestStatus.COMPLETED })
            .getCount();
        const criticalAlerts = await this.orderTestRepo
            .createQueryBuilder('ot')
            .innerJoin('ot.sample', 's')
            .innerJoin('s.order', 'o')
            .where('o.labId = :labId', { labId })
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
    async getOrdersTrend(labId, days) {
        return this.ordersService.getOrdersTrend(labId, days);
    }
    async getStatistics(labId, startDate, endDate) {
        const [orderStats, testsData, tatData, qualityData, unmatchedStats, instrumentWorkload] = await Promise.all([
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
    async getTestsStatsForPeriod(labId, startDate, endDate) {
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
            departmentId: r.departmentId,
            departmentName: String(r.departmentName || r.departmentId || 'Unassigned'),
            count: parseInt(r.count, 10),
        }));
        const byTest = testRows.map((r) => ({
            testId: r.testId,
            testCode: String(r.testCode ?? ''),
            testName: String(r.testName ?? r.testCode ?? ''),
            count: parseInt(r.count, 10),
        }));
        const byShift = shiftRows.map((r) => ({
            shiftId: r.shiftId,
            shiftName: String(r.shiftName || r.shiftId || 'No shift'),
            count: parseInt(r.count, 10),
        }));
        return { total, byDepartment, byTest, byShift };
    }
    async getTatForPeriod(labId, startDate, endDate) {
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
    async getQualityForPeriod(labId, startDate, endDate) {
        const base = this.orderTestRepo
            .createQueryBuilder('ot')
            .innerJoin('ot.sample', 's')
            .innerJoin('s.order', 'o')
            .where('o.labId = :labId', { labId })
            .andWhere('ot.status = :verified', { verified: order_test_entity_1.OrderTestStatus.VERIFIED })
            .andWhere('o.registeredAt BETWEEN :startDate AND :endDate', { startDate, endDate });
        const [abnormalCount, criticalCount, totalVerified] = await Promise.all([
            base
                .clone()
                .andWhere('ot.flag IN (:...flags)', { flags: [order_test_entity_1.ResultFlag.HIGH, order_test_entity_1.ResultFlag.LOW] })
                .getCount(),
            base
                .clone()
                .andWhere('ot.flag IN (:...flags)', { flags: [order_test_entity_1.ResultFlag.CRITICAL_HIGH, order_test_entity_1.ResultFlag.CRITICAL_LOW] })
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
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        orders_service_1.OrdersService,
        unmatched_results_service_1.UnmatchedResultsService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map