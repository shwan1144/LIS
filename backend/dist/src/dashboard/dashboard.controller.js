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
let DashboardController = class DashboardController {
    constructor(dashboardService) {
        this.dashboardService = dashboardService;
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
    async getStatistics(req, startDateStr, endDateStr) {
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
    emptyStatistics() {
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
    __param(1, (0, common_1.Query)('startDate')),
    __param(2, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], DashboardController.prototype, "getStatistics", null);
exports.DashboardController = DashboardController = __decorate([
    (0, common_1.Controller)('dashboard'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [dashboard_service_1.DashboardService])
], DashboardController);
//# sourceMappingURL=dashboard.controller.js.map