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
exports.BulkMessagingController = void 0;
const common_1 = require("@nestjs/common");
const admin_host_guard_1 = require("../tenant/admin-host.guard");
const admin_jwt_auth_guard_1 = require("../admin-auth/admin-jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const bulk_messaging_service_1 = require("./bulk-messaging.service");
let BulkMessagingController = class BulkMessagingController {
    constructor(bulkMessagingService) {
        this.bulkMessagingService = bulkMessagingService;
    }
    async getLabConfig(labId) {
        return this.bulkMessagingService.getLabConfig(labId);
    }
    async updateLabConfig(req, labId, body) {
        return this.bulkMessagingService.updateLabConfig(labId, body, this.getActorContext(req));
    }
    async getLabTemplates(labId) {
        return this.bulkMessagingService.getLabTemplates(labId);
    }
    async updateLabTemplates(req, labId, body) {
        return this.bulkMessagingService.updateLabTemplates(labId, body, this.getActorContext(req));
    }
    async preview(body) {
        return this.bulkMessagingService.preview(body);
    }
    async send(req, body) {
        return this.bulkMessagingService.send(body, this.getActorContext(req));
    }
    async listJobs(labId, status, dateFrom, dateTo, page, size) {
        return this.bulkMessagingService.listJobs({
            labId,
            status,
            dateFrom,
            dateTo,
            page: page ? parseInt(page, 10) : undefined,
            size: size ? parseInt(size, 10) : undefined,
        });
    }
    async getJobDetail(batchId, status, channel, page, size) {
        return this.bulkMessagingService.getJobDetail(batchId, {
            status,
            channel,
            page: page ? parseInt(page, 10) : undefined,
            size: size ? parseInt(size, 10) : undefined,
        });
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
exports.BulkMessagingController = BulkMessagingController;
__decorate([
    (0, common_1.Get)('labs/:labId/config'),
    __param(0, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BulkMessagingController.prototype, "getLabConfig", null);
__decorate([
    (0, common_1.Patch)('labs/:labId/config'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], BulkMessagingController.prototype, "updateLabConfig", null);
__decorate([
    (0, common_1.Get)('labs/:labId/templates'),
    __param(0, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BulkMessagingController.prototype, "getLabTemplates", null);
__decorate([
    (0, common_1.Patch)('labs/:labId/templates'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('labId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], BulkMessagingController.prototype, "updateLabTemplates", null);
__decorate([
    (0, common_1.Post)('preview'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BulkMessagingController.prototype, "preview", null);
__decorate([
    (0, common_1.Post)('send'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BulkMessagingController.prototype, "send", null);
__decorate([
    (0, common_1.Get)('jobs'),
    __param(0, (0, common_1.Query)('labId')),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('dateFrom')),
    __param(3, (0, common_1.Query)('dateTo')),
    __param(4, (0, common_1.Query)('page')),
    __param(5, (0, common_1.Query)('size')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], BulkMessagingController.prototype, "listJobs", null);
__decorate([
    (0, common_1.Get)('jobs/:batchId'),
    __param(0, (0, common_1.Param)('batchId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('channel')),
    __param(3, (0, common_1.Query)('page')),
    __param(4, (0, common_1.Query)('size')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], BulkMessagingController.prototype, "getJobDetail", null);
exports.BulkMessagingController = BulkMessagingController = __decorate([
    (0, common_1.Controller)('admin/api/bulk-messaging'),
    (0, common_1.UseGuards)(admin_host_guard_1.AdminHostGuard, admin_jwt_auth_guard_1.AdminJwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'AUDITOR'),
    __metadata("design:paramtypes", [bulk_messaging_service_1.BulkMessagingService])
], BulkMessagingController);
//# sourceMappingURL=bulk-messaging.controller.js.map