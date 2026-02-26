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
exports.DashboardController = void 0;
const common_1 = require("@nestjs/common");
const dashboard_service_1 = require("./dashboard.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const statistics_query_dto_1 = require("./dto/statistics-query.dto");
const audit_service_1 = require("../audit/audit.service");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const lab_actor_context_1 = require("../types/lab-actor-context");
const lab_timezone_util_1 = require("../database/lab-timezone.util");
let DashboardController = class DashboardController {
    constructor(dashboardService, auditService) {
        this.dashboardService = dashboardService;
        this.auditService = auditService;
    }
    async getKpis(req) {
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
    async getOrdersTrend(req, days) {
        const labId = req.user?.labId;
        const numDays = Math.min(31, Math.max(1, parseInt(days || '7', 10) || 7));
        const data = labId
            ? await this.dashboardService.getOrdersTrend(labId, numDays)
            : [];
        return { data };
    }
    async getStatistics(req, query) {
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
    async getStatisticsPdf(req, query, res) {
        const labId = req.user?.labId;
        if (!labId) {
            return res.status(401).json({ message: 'Lab ID not found in token' });
        }
        const timeZone = await this.dashboardService.getLabTimeZone(labId);
        const { startDate, endDate, startDateLabel, endDateLabel } = this.resolveRange(timeZone, query.startDate, query.endDate);
        const shiftToken = query.shiftId ? this.toSafeFileToken(query.shiftId) : 'all';
        const departmentToken = query.departmentId ? this.toSafeFileToken(query.departmentId) : 'all';
        const fileName = `statistics-${startDateLabel}-to-${endDateLabel}-${shiftToken}-${departmentToken}.pdf`;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        try {
            const pdfBuffer = await this.dashboardService.generateStatisticsPdf(labId, startDate, endDate, {
                shiftId: query.shiftId ?? null,
                departmentId: query.departmentId ?? null,
            });
            const impersonationAudit = actor.isImpersonation && actor.platformUserId
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
                action: audit_log_entity_1.AuditAction.REPORT_EXPORT,
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
                userAgent: req.headers?.['user-agent'] ?? null,
            });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            return res.send(pdfBuffer);
        }
        catch (error) {
            return res.status(500).json({
                message: 'Failed to generate statistics PDF',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
    emptyStatistics() {
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
    resolveRange(timeZone, startDateStr, endDateStr) {
        let startDateLabel = startDateStr?.trim() ?? '';
        let endDateLabel = endDateStr?.trim() ?? '';
        let startDate;
        let endDate;
        try {
            endDateLabel = endDateLabel || (0, lab_timezone_util_1.formatDateKeyForTimeZone)(new Date(), timeZone);
            startDateLabel = startDateLabel || (0, lab_timezone_util_1.addDaysToDateKey)(endDateLabel, -30);
            ({ startDate } = (0, lab_timezone_util_1.getUtcRangeForLabDate)(startDateLabel, timeZone));
            ({ endDate } = (0, lab_timezone_util_1.getUtcRangeForLabDate)(endDateLabel, timeZone));
        }
        catch {
            throw new common_1.BadRequestException('Invalid date range. Expected YYYY-MM-DD.');
        }
        if (startDate.getTime() > endDate.getTime()) {
            throw new common_1.BadRequestException('startDate cannot be after endDate');
        }
        return { startDate, endDate, startDateLabel, endDateLabel };
    }
    toSafeFileToken(value) {
        return value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'all';
    }
};
exports.DashboardController = DashboardController;
__decorate([
    (0, common_1.Get)('kpis'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DashboardController.prototype, "getKpis", null);
__decorate([
    (0, common_1.Get)('orders-trend'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], DashboardController.prototype, "getOrdersTrend", null);
__decorate([
    (0, common_1.Get)('statistics'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('LAB_ADMIN', 'SUPER_ADMIN'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, statistics_query_dto_1.StatisticsQueryDto]),
    __metadata("design:returntype", Promise)
], DashboardController.prototype, "getStatistics", null);
__decorate([
    (0, common_1.Get)('statistics/pdf'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('LAB_ADMIN', 'SUPER_ADMIN'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, statistics_query_dto_1.StatisticsQueryDto, Object]),
    __metadata("design:returntype", Promise)
], DashboardController.prototype, "getStatisticsPdf", null);
exports.DashboardController = DashboardController = __decorate([
    (0, common_1.Controller)('dashboard'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [dashboard_service_1.DashboardService,
        audit_service_1.AuditService])
], DashboardController);
//# sourceMappingURL=dashboard.controller.js.map