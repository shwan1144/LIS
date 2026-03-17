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
exports.SubLabsController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const lab_role_matrix_1 = require("../auth/lab-role-matrix");
const save_sub_lab_dto_1 = require("./dto/save-sub-lab.dto");
const sub_labs_service_1 = require("./sub-labs.service");
const create_order_response_dto_1 = require("../orders/dto/create-order-response.dto");
const statistics_query_dto_1 = require("../dashboard/dto/statistics-query.dto");
const lab_timezone_util_1 = require("../database/lab-timezone.util");
const dashboard_service_1 = require("../dashboard/dashboard.service");
let SubLabsController = class SubLabsController {
    constructor(subLabsService, dashboardService) {
        this.subLabsService = subLabsService;
        this.dashboardService = dashboardService;
    }
    async listSubLabs(req) {
        return this.subLabsService.listForLab(req.user.labId);
    }
    async listSubLabOptions(req) {
        return this.subLabsService.listActiveOptions(req.user.labId);
    }
    async getSubLab(req, id) {
        return this.subLabsService.getForLab(req.user.labId, id);
    }
    async createSubLab(req, dto) {
        return this.subLabsService.createForLab(req.user.labId, dto);
    }
    async updateSubLab(req, id, dto) {
        return this.subLabsService.updateForLab(req.user.labId, id, dto);
    }
    async archiveSubLab(req, id) {
        return this.subLabsService.archiveForLab(req.user.labId, id);
    }
    async getPortalProfile(req) {
        return this.subLabsService.getPortalProfile(req.user.labId, req.user.subLabId ?? '');
    }
    async listPortalOrders(req, page, size, search, status, patientId, shiftId, startDate, endDate, dateFilterTimeZone, resultStatus) {
        return this.subLabsService.listPortalOrders(req.user.labId, req.user.subLabId ?? '', {
            page: page ? parseInt(page, 10) : undefined,
            size: size ? parseInt(size, 10) : undefined,
            search,
            status: status,
            patientId,
            shiftId,
            startDate,
            endDate,
            dateFilterTimeZone,
            resultStatus,
        });
    }
    async getPortalOrderDetail(req, id) {
        return this.subLabsService.getPortalOrderDetail(req.user.labId, req.user.subLabId ?? '', id);
    }
    async downloadPortalOrderResults(req, id, res) {
        const pdf = await this.subLabsService.generatePortalResultsPdf(req.user.labId, req.user.subLabId ?? '', id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="results-${id.substring(0, 8)}.pdf"`);
        return res.send(pdf);
    }
    async getPortalStatistics(req, query) {
        const timeZone = await this.dashboardService.getLabTimeZone(req.user.labId);
        const { startDate, endDate } = this.resolveRange(timeZone, query.startDate, query.endDate);
        return this.subLabsService.getPortalStatistics(req.user.labId, req.user.subLabId ?? '', startDate, endDate);
    }
    resolveRange(timeZone, startDateStr, endDateStr) {
        const endDateLabel = endDateStr?.trim() || (0, lab_timezone_util_1.formatDateKeyForTimeZone)(new Date(), timeZone);
        const startDateLabel = startDateStr?.trim() || (0, lab_timezone_util_1.addDaysToDateKey)(endDateLabel, -30);
        const { startDate } = (0, lab_timezone_util_1.getUtcRangeForLabDate)(startDateLabel, timeZone);
        const { endDate } = (0, lab_timezone_util_1.getUtcRangeForLabDate)(endDateLabel, timeZone);
        return { startDate, endDate };
    }
};
exports.SubLabsController = SubLabsController;
__decorate([
    (0, common_1.Get)('settings/sub-labs'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ADMIN),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SubLabsController.prototype, "listSubLabs", null);
__decorate([
    (0, common_1.Get)('settings/sub-labs/options'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ORDERS_WORKFLOW),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SubLabsController.prototype, "listSubLabOptions", null);
__decorate([
    (0, common_1.Get)('settings/sub-labs/:id'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ADMIN),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SubLabsController.prototype, "getSubLab", null);
__decorate([
    (0, common_1.Post)('settings/sub-labs'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ADMIN),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, save_sub_lab_dto_1.SaveSubLabDto]),
    __metadata("design:returntype", Promise)
], SubLabsController.prototype, "createSubLab", null);
__decorate([
    (0, common_1.Patch)('settings/sub-labs/:id'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ADMIN),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, save_sub_lab_dto_1.SaveSubLabDto]),
    __metadata("design:returntype", Promise)
], SubLabsController.prototype, "updateSubLab", null);
__decorate([
    (0, common_1.Delete)('settings/sub-labs/:id'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ADMIN),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SubLabsController.prototype, "archiveSubLab", null);
__decorate([
    (0, common_1.Get)('sub-lab/profile'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.SUB_LAB_PORTAL),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SubLabsController.prototype, "getPortalProfile", null);
__decorate([
    (0, common_1.Get)('sub-lab/orders'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.SUB_LAB_PORTAL),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('size')),
    __param(3, (0, common_1.Query)('search')),
    __param(4, (0, common_1.Query)('status')),
    __param(5, (0, common_1.Query)('patientId')),
    __param(6, (0, common_1.Query)('shiftId')),
    __param(7, (0, common_1.Query)('startDate')),
    __param(8, (0, common_1.Query)('endDate')),
    __param(9, (0, common_1.Query)('dateFilterTimeZone')),
    __param(10, (0, common_1.Query)('resultStatus', new common_1.ParseEnumPipe(create_order_response_dto_1.OrderResultStatus, { optional: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], SubLabsController.prototype, "listPortalOrders", null);
__decorate([
    (0, common_1.Get)('sub-lab/orders/:id'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.SUB_LAB_PORTAL),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SubLabsController.prototype, "getPortalOrderDetail", null);
__decorate([
    (0, common_1.Get)('sub-lab/orders/:id/results'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.SUB_LAB_PORTAL),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], SubLabsController.prototype, "downloadPortalOrderResults", null);
__decorate([
    (0, common_1.Get)('sub-lab/statistics'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.SUB_LAB_PORTAL),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, statistics_query_dto_1.StatisticsQueryDto]),
    __metadata("design:returntype", Promise)
], SubLabsController.prototype, "getPortalStatistics", null);
exports.SubLabsController = SubLabsController = __decorate([
    (0, common_1.Controller)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [sub_labs_service_1.SubLabsService,
        dashboard_service_1.DashboardService])
], SubLabsController);
//# sourceMappingURL=sub-labs.controller.js.map