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
exports.WorklistController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const worklist_service_1 = require("./worklist.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const order_test_entity_1 = require("../entities/order-test.entity");
const lab_actor_context_1 = require("../types/lab-actor-context");
const lab_role_matrix_1 = require("../auth/lab-role-matrix");
const order_entity_1 = require("../entities/order.entity");
let WorklistController = class WorklistController {
    constructor(worklistService) {
        this.worklistService = worklistService;
    }
    async getWorklist(req, status, search, date, departmentId, page, size, view) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        const selectedView = view ?? worklist_service_1.WorklistView.FULL;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        if (!req.user?.role) {
            throw new common_1.ForbiddenException('Missing role in token');
        }
        (0, lab_role_matrix_1.assertWorklistViewAllowed)(req.user.role, selectedView);
        let statuses;
        if (status) {
            statuses = status.split(',').filter((s) => Object.values(order_test_entity_1.OrderTestStatus).includes(s));
        }
        return this.worklistService.getWorklist(labId, {
            status: statuses,
            search,
            date,
            departmentId,
            page: page ? parseInt(page, 10) : undefined,
            size: size ? parseInt(size, 10) : undefined,
            view: selectedView,
        }, actor.userId ?? undefined);
    }
    async getWorklistOrders(req, search, date, departmentId, page, size, mode, entryStatus, verificationStatus, orderStatus) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        const selectedMode = mode ?? worklist_service_1.WorklistOrderMode.ENTRY;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        if (!req.user?.role) {
            throw new common_1.ForbiddenException('Missing role in token');
        }
        (0, lab_role_matrix_1.assertWorklistModeAllowed)(req.user.role, selectedMode);
        return this.worklistService.getWorklistOrders(labId, {
            search,
            date,
            departmentId,
            page: page ? parseInt(page, 10) : undefined,
            size: size ? parseInt(size, 10) : undefined,
            mode: selectedMode,
            entryStatus,
            verificationStatus,
            orderStatus,
        }, actor.userId ?? undefined);
    }
    async getWorklistOrderTests(req, orderId, departmentId, mode) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        const selectedMode = mode ?? worklist_service_1.WorklistOrderMode.ENTRY;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        if (!req.user?.role) {
            throw new common_1.ForbiddenException('Missing role in token');
        }
        (0, lab_role_matrix_1.assertWorklistModeAllowed)(req.user.role, selectedMode);
        return this.worklistService.getWorklistOrderTests(orderId, labId, {
            departmentId,
            mode: selectedMode,
        }, actor.userId ?? undefined);
    }
    async getCultureEntryHistory(req) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.worklistService.getCultureEntryHistory(labId);
    }
    async getWorklistItemDetail(req, id) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.worklistService.getWorklistItemDetail(id, labId, actor.userId ?? undefined);
    }
    async getStats(req) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.worklistService.getWorklistStats(labId);
    }
    async enterResult(req, id, body) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.worklistService.enterResult(id, labId, actor, body, req.user?.role);
    }
    async batchEnterResults(req, body) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.worklistService.batchEnterResults(labId, actor, req.user?.role, body.updates);
    }
    async uploadResultDocument(req, id, file, forceEditVerified) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.worklistService.uploadResultDocument(id, labId, actor, req.user?.role, file, { forceEditVerified: forceEditVerified === true || forceEditVerified === 'true' });
    }
    async removeResultDocument(req, id, forceEditVerified) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.worklistService.removeResultDocument(id, labId, actor, req.user?.role, {
            forceEditVerified: forceEditVerified === 'true',
        });
    }
    async downloadResultDocument(req, id, download, res) {
        const labId = req.user?.labId;
        if (!labId || !res) {
            throw new Error('Lab ID not found in token');
        }
        const result = await this.worklistService.getResultDocumentForLab(id, labId);
        res.setHeader('Content-Type', result.mimeType);
        res.setHeader('Content-Disposition', `${download === 'true' ? 'attachment' : 'inline'}; filename="${encodeURIComponent(result.fileName)}"`);
        return res.send(result.buffer);
    }
    async verifyResult(req, id) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.worklistService.verifyResult(id, labId, actor);
    }
    async verifyMultiple(req, body) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.worklistService.verifyMultiple(body.ids, labId, actor);
    }
    async rejectResult(req, id, body) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.worklistService.rejectResult(id, labId, actor, body.reason);
    }
};
exports.WorklistController = WorklistController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.WORKLIST_LANE_READ),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('search')),
    __param(3, (0, common_1.Query)('date')),
    __param(4, (0, common_1.Query)('departmentId')),
    __param(5, (0, common_1.Query)('page')),
    __param(6, (0, common_1.Query)('size')),
    __param(7, (0, common_1.Query)('view', new common_1.ParseEnumPipe(worklist_service_1.WorklistView, { optional: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "getWorklist", null);
__decorate([
    (0, common_1.Get)('orders'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.WORKLIST_LANE_READ),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('search')),
    __param(2, (0, common_1.Query)('date')),
    __param(3, (0, common_1.Query)('departmentId')),
    __param(4, (0, common_1.Query)('page')),
    __param(5, (0, common_1.Query)('size')),
    __param(6, (0, common_1.Query)('mode', new common_1.ParseEnumPipe(worklist_service_1.WorklistOrderMode, { optional: true }))),
    __param(7, (0, common_1.Query)('entryStatus', new common_1.ParseEnumPipe(worklist_service_1.WorklistEntryStatus, { optional: true }))),
    __param(8, (0, common_1.Query)('verificationStatus', new common_1.ParseEnumPipe(worklist_service_1.WorklistVerificationStatus, { optional: true }))),
    __param(9, (0, common_1.Query)('orderStatus', new common_1.ParseEnumPipe(order_entity_1.OrderStatus, { optional: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "getWorklistOrders", null);
__decorate([
    (0, common_1.Get)('orders/:orderId/tests'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.WORKLIST_LANE_READ),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('orderId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Query)('departmentId')),
    __param(3, (0, common_1.Query)('mode', new common_1.ParseEnumPipe(worklist_service_1.WorklistOrderMode, { optional: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "getWorklistOrderTests", null);
__decorate([
    (0, common_1.Get)('culture-entry-history'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.WORKLIST_LANE_READ),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "getCultureEntryHistory", null);
__decorate([
    (0, common_1.Get)(':id/detail'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.WORKLIST_LANE_READ),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "getWorklistItemDetail", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.WORKLIST_STATS_READ),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "getStats", null);
__decorate([
    (0, common_1.Patch)(':id/result'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.WORKLIST_ENTRY),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "enterResult", null);
__decorate([
    (0, common_1.Patch)('batch-result'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.WORKLIST_ENTRY),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "batchEnterResults", null);
__decorate([
    (0, common_1.Post)('order-tests/:id/result-document'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.WORKLIST_ENTRY),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.UploadedFile)()),
    __param(3, (0, common_1.Body)('forceEditVerified')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "uploadResultDocument", null);
__decorate([
    (0, common_1.Delete)('order-tests/:id/result-document'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.WORKLIST_ENTRY),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Query)('forceEditVerified')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "removeResultDocument", null);
__decorate([
    (0, common_1.Get)('order-tests/:id/result-document'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.WORKLIST_LANE_READ),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Query)('download')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "downloadResultDocument", null);
__decorate([
    (0, common_1.Patch)(':id/verify'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.WORKLIST_VERIFY),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "verifyResult", null);
__decorate([
    (0, common_1.Post)('verify-multiple'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.WORKLIST_VERIFY),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "verifyMultiple", null);
__decorate([
    (0, common_1.Patch)(':id/reject'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.WORKLIST_VERIFY),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "rejectResult", null);
exports.WorklistController = WorklistController = __decorate([
    (0, common_1.Controller)('worklist'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [worklist_service_1.WorklistService])
], WorklistController);
//# sourceMappingURL=worklist.controller.js.map