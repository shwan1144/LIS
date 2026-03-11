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
exports.AuditController = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("./audit.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const audit_log_entity_1 = require("../entities/audit-log.entity");
let AuditController = class AuditController {
    constructor(auditService) {
        this.auditService = auditService;
    }
    async findAll(req, userId, action, entityType, entityId, startDate, endDate, search, page, size) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        let actions;
        if (action) {
            const actionList = action.split(',').filter((a) => Object.values(audit_log_entity_1.AuditAction).includes(a));
            actions = actionList.length === 1 ? actionList[0] : actionList;
        }
        return this.auditService.findAll(labId, {
            userId,
            action: actions,
            entityType,
            entityId,
            startDate,
            endDate,
            search,
            page: page ? parseInt(page, 10) : undefined,
            size: size ? parseInt(size, 10) : undefined,
        });
    }
    async getActions() {
        return this.auditService.getActions();
    }
    async getEntityTypes(req) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.auditService.getEntityTypes(labId);
    }
};
exports.AuditController = AuditController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('userId')),
    __param(2, (0, common_1.Query)('action')),
    __param(3, (0, common_1.Query)('entityType')),
    __param(4, (0, common_1.Query)('entityId')),
    __param(5, (0, common_1.Query)('startDate')),
    __param(6, (0, common_1.Query)('endDate')),
    __param(7, (0, common_1.Query)('search')),
    __param(8, (0, common_1.Query)('page')),
    __param(9, (0, common_1.Query)('size')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], AuditController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('actions'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AuditController.prototype, "getActions", null);
__decorate([
    (0, common_1.Get)('entity-types'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuditController.prototype, "getEntityTypes", null);
exports.AuditController = AuditController = __decorate([
    (0, common_1.Controller)('audit'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [audit_service_1.AuditService])
], AuditController);
//# sourceMappingURL=audit.controller.js.map