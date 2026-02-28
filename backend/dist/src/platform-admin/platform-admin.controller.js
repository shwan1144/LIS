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
exports.PlatformAdminController = void 0;
const common_1 = require("@nestjs/common");
const admin_host_guard_1 = require("../tenant/admin-host.guard");
const admin_jwt_auth_guard_1 = require("../admin-auth/admin-jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const platform_admin_service_1 = require("./platform-admin.service");
const create_lab_dto_1 = require("./dto/create-lab.dto");
const update_lab_dto_1 = require("./dto/update-lab.dto");
const set_lab_status_dto_1 = require("./dto/set-lab-status.dto");
const export_audit_logs_dto_1 = require("./dto/export-audit-logs.dto");
const reset_lab_user_password_dto_1 = require("./dto/reset-lab-user-password.dto");
const start_impersonation_dto_1 = require("./dto/start-impersonation.dto");
let PlatformAdminController = class PlatformAdminController {
    constructor(platformAdminService) {
        this.platformAdminService = platformAdminService;
    }
    async listLabs() {
        return this.platformAdminService.listLabs();
    }
    async listLabsPaged(q, status, page, size) {
        return this.platformAdminService.listLabsPaged({
            q,
            status,
            page: page ? parseInt(page, 10) : undefined,
            size: size ? parseInt(size, 10) : undefined,
        });
    }
    async getImpersonationStatus(req) {
        return this.platformAdminService.getImpersonationStatus(req.user);
    }
    async startImpersonation(req, dto) {
        return this.platformAdminService.startImpersonation(dto, {
            ...this.getActorContext(req),
            impersonatedLabId: req.user.impersonatedLabId ?? null,
        });
    }
    async stopImpersonation(req) {
        return this.platformAdminService.stopImpersonation({
            ...this.getActorContext(req),
            impersonatedLabId: req.user.impersonatedLabId ?? null,
        });
    }
    async openImpersonatedLabPortal(req) {
        return this.platformAdminService.createImpersonatedLabPortalToken({
            ...this.getActorContext(req),
            impersonatedLabId: req.user.impersonatedLabId ?? null,
        });
    }
    async createLab(req, dto) {
        return this.platformAdminService.createLab(dto, this.getActorContext(req));
    }
    async getLab(req, labId) {
        return this.platformAdminService.getLab(labId, this.getActorContext(req));
    }
    async updateLab(req, labId, dto) {
        return this.platformAdminService.updateLab(labId, dto, this.getActorContext(req));
    }
    async setLabStatus(req, labId, dto) {
        return this.platformAdminService.setLabStatus(labId, dto, this.getActorContext(req));
    }
    async getSummary(req, labId, dateFrom, dateTo) {
        return this.platformAdminService.getSummary({ labId, dateFrom, dateTo }, this.getActorContext(req));
    }
    async getSettingsRoles() {
        return this.platformAdminService.getSettingsRoles();
    }
    async getLabSettings(req, labId) {
        return this.platformAdminService.getLabSettings(labId, this.getActorContext(req));
    }
    async updateLabSettings(labId, body) {
        return this.platformAdminService.updateLabSettings(labId, body);
    }
    async getLabUsers(req, labId) {
        return this.platformAdminService.getLabUsers(labId, this.getActorContext(req));
    }
    async getLabUser(req, labId, id) {
        return this.platformAdminService.getLabUser(id, labId, this.getActorContext(req));
    }
    async createLabUser(labId, body) {
        return this.platformAdminService.createLabUser(labId, body);
    }
    async updateLabUser(labId, id, body) {
        return this.platformAdminService.updateLabUser(id, labId, body);
    }
    async deleteLabUser(labId, id) {
        return this.platformAdminService.deleteLabUser(id, labId);
    }
    async resetLabUserPassword(req, labId, id, dto) {
        return this.platformAdminService.resetLabUserPassword(id, labId, dto, this.getActorContext(req));
    }
    async getLabShifts(labId) {
        return this.platformAdminService.getLabShifts(labId);
    }
    async getLabDepartments(labId) {
        return this.platformAdminService.getLabDepartments(labId);
    }
    async listOrders(req, labId, status, q, dateFrom, dateTo, page, size) {
        return this.platformAdminService.listOrders({
            labId,
            status,
            q,
            dateFrom,
            dateTo,
            page: page ? parseInt(page, 10) : undefined,
            size: size ? parseInt(size, 10) : undefined,
        }, this.getActorContext(req));
    }
    async getOrderDetail(req, orderId) {
        return this.platformAdminService.getOrderDetail(orderId, this.getActorContext(req));
    }
    async getOrderResultsPdf(req, orderId, res) {
        try {
            const { pdfBuffer, fileName } = await this.platformAdminService.generateOrderResultsPdf(orderId, this.getActorContext(req));
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
            res.send(pdfBuffer);
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                const response = error.getResponse();
                const message = typeof response === 'string'
                    ? response
                    : (response.message ?? error.message);
                return res.status(error.getStatus()).json({ message });
            }
            if (error instanceof Error && error.message.includes('not found')) {
                return res.status(404).json({ message: error.message });
            }
            return res.status(500).json({ message: 'Failed to generate results PDF' });
        }
    }
    async listAuditLogs(labId, actorType, action, entityType, search, dateFrom, dateTo, page, size) {
        return this.platformAdminService.listAuditLogs({
            labId,
            actorType,
            action,
            entityType,
            search,
            dateFrom,
            dateTo,
            page: page ? parseInt(page, 10) : undefined,
            size: size ? parseInt(size, 10) : undefined,
        });
    }
    async exportAuditLogs(req, dto, res) {
        try {
            const { csvBuffer, fileName } = await this.platformAdminService.exportAuditLogsCsv(dto, this.getActorContext(req));
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.send(csvBuffer);
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                const response = error.getResponse();
                const message = typeof response === 'string'
                    ? response
                    : (response.message ?? error.message);
                return res.status(error.getStatus()).json({ message });
            }
            return res.status(500).json({ message: 'Failed to export audit logs' });
        }
    }
    async getAuditActions() {
        return this.platformAdminService.getAuditActionOptions();
    }
    async getAuditEntityTypes(labId) {
        return this.platformAdminService.getAuditEntityTypeOptions({ labId });
    }
    async getSystemHealth() {
        return this.platformAdminService.getSystemHealth();
    }
    async getPlatformSettingsOverview() {
        return this.platformAdminService.getPlatformSettingsOverview();
    }
    getActorContext(req) {
        const forwardedFor = req.headers['x-forwarded-for'];
        const ipAddress = Array.isArray(forwardedFor)
            ? forwardedFor[0]
            : (forwardedFor?.split(',')[0]?.trim() ?? req.ip ?? null);
        const userAgentHeader = req.headers['user-agent'];
        const userAgent = Array.isArray(userAgentHeader)
            ? userAgentHeader.join('; ')
            : (userAgentHeader ?? null);
        return {
            platformUserId: req.user.platformUserId,
            role: req.user.role,
            ipAddress,
            userAgent,
        };
    }
};
exports.PlatformAdminController = PlatformAdminController;
__decorate([
    (0, common_1.Get)('labs'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "listLabs", null);
__decorate([
    (0, common_1.Get)('labs/list'),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('size')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "listLabsPaged", null);
__decorate([
    (0, common_1.Get)('impersonation'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "getImpersonationStatus", null);
__decorate([
    (0, common_1.Post)('impersonation/start'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, start_impersonation_dto_1.StartImpersonationDto]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "startImpersonation", null);
__decorate([
    (0, common_1.Post)('impersonation/stop'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "stopImpersonation", null);
__decorate([
    (0, common_1.Post)('impersonation/open-lab'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "openImpersonatedLabPortal", null);
__decorate([
    (0, common_1.Post)('labs'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_lab_dto_1.CreateLabDto]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "createLab", null);
__decorate([
    (0, common_1.Get)('labs/:labId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "getLab", null);
__decorate([
    (0, common_1.Patch)('labs/:labId'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_lab_dto_1.UpdateLabDto]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "updateLab", null);
__decorate([
    (0, common_1.Post)('labs/:labId/status'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, set_lab_status_dto_1.SetLabStatusDto]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "setLabStatus", null);
__decorate([
    (0, common_1.Get)('dashboard/summary'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('labId')),
    __param(2, (0, common_1.Query)('dateFrom')),
    __param(3, (0, common_1.Query)('dateTo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "getSummary", null);
__decorate([
    (0, common_1.Get)('settings/roles'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "getSettingsRoles", null);
__decorate([
    (0, common_1.Get)('labs/:labId/settings'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "getLabSettings", null);
__decorate([
    (0, common_1.Patch)('labs/:labId/settings'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "updateLabSettings", null);
__decorate([
    (0, common_1.Get)('labs/:labId/users'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "getLabUsers", null);
__decorate([
    (0, common_1.Get)('labs/:labId/users/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "getLabUser", null);
__decorate([
    (0, common_1.Post)('labs/:labId/users'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "createLabUser", null);
__decorate([
    (0, common_1.Patch)('labs/:labId/users/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "updateLabUser", null);
__decorate([
    (0, common_1.Delete)('labs/:labId/users/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "deleteLabUser", null);
__decorate([
    (0, common_1.Post)('labs/:labId/users/:id/reset-password'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, reset_lab_user_password_dto_1.ResetLabUserPasswordDto]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "resetLabUserPassword", null);
__decorate([
    (0, common_1.Get)('labs/:labId/shifts'),
    __param(0, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "getLabShifts", null);
__decorate([
    (0, common_1.Get)('labs/:labId/departments'),
    __param(0, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "getLabDepartments", null);
__decorate([
    (0, common_1.Get)('orders'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('labId')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('q')),
    __param(4, (0, common_1.Query)('dateFrom')),
    __param(5, (0, common_1.Query)('dateTo')),
    __param(6, (0, common_1.Query)('page')),
    __param(7, (0, common_1.Query)('size')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "listOrders", null);
__decorate([
    (0, common_1.Get)('orders/:orderId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('orderId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "getOrderDetail", null);
__decorate([
    (0, common_1.Get)('orders/:orderId/results'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('orderId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "getOrderResultsPdf", null);
__decorate([
    (0, common_1.Get)('audit-logs'),
    __param(0, (0, common_1.Query)('labId')),
    __param(1, (0, common_1.Query)('actorType')),
    __param(2, (0, common_1.Query)('action')),
    __param(3, (0, common_1.Query)('entityType')),
    __param(4, (0, common_1.Query)('search')),
    __param(5, (0, common_1.Query)('dateFrom')),
    __param(6, (0, common_1.Query)('dateTo')),
    __param(7, (0, common_1.Query)('page')),
    __param(8, (0, common_1.Query)('size')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "listAuditLogs", null);
__decorate([
    (0, common_1.Post)('audit-logs/export'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true, transform: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, export_audit_logs_dto_1.ExportAuditLogsDto, Object]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "exportAuditLogs", null);
__decorate([
    (0, common_1.Get)('audit-logs/actions'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "getAuditActions", null);
__decorate([
    (0, common_1.Get)('audit-logs/entity-types'),
    __param(0, (0, common_1.Query)('labId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "getAuditEntityTypes", null);
__decorate([
    (0, common_1.Get)('system-health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "getSystemHealth", null);
__decorate([
    (0, common_1.Get)('settings/platform'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PlatformAdminController.prototype, "getPlatformSettingsOverview", null);
exports.PlatformAdminController = PlatformAdminController = __decorate([
    (0, common_1.Controller)('admin/api'),
    (0, common_1.UseGuards)(admin_host_guard_1.AdminHostGuard, admin_jwt_auth_guard_1.AdminJwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'AUDITOR'),
    __metadata("design:paramtypes", [platform_admin_service_1.PlatformAdminService])
], PlatformAdminController);
//# sourceMappingURL=platform-admin.controller.js.map