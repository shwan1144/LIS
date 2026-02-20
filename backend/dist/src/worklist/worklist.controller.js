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
const worklist_service_1 = require("./worklist.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const order_test_entity_1 = require("../entities/order-test.entity");
const lab_actor_context_1 = require("../types/lab-actor-context");
let WorklistController = class WorklistController {
    constructor(worklistService) {
        this.worklistService = worklistService;
    }
    async getWorklist(req, status, search, date, departmentId, page, size) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
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
        }, actor.userId ?? undefined);
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
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('search')),
    __param(3, (0, common_1.Query)('date')),
    __param(4, (0, common_1.Query)('departmentId')),
    __param(5, (0, common_1.Query)('page')),
    __param(6, (0, common_1.Query)('size')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "getWorklist", null);
__decorate([
    (0, common_1.Get)('stats'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "getStats", null);
__decorate([
    (0, common_1.Patch)(':id/result'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "enterResult", null);
__decorate([
    (0, common_1.Patch)(':id/verify'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "verifyResult", null);
__decorate([
    (0, common_1.Post)('verify-multiple'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "verifyMultiple", null);
__decorate([
    (0, common_1.Patch)(':id/reject'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], WorklistController.prototype, "rejectResult", null);
exports.WorklistController = WorklistController = __decorate([
    (0, common_1.Controller)('worklist'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [worklist_service_1.WorklistService])
], WorklistController);
//# sourceMappingURL=worklist.controller.js.map