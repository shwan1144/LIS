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
exports.SettingsController = void 0;
const common_1 = require("@nestjs/common");
const settings_service_1 = require("./settings.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
let SettingsController = class SettingsController {
    constructor(settingsService) {
        this.settingsService = settingsService;
    }
    getRoles() {
        throw new common_1.ForbiddenException('Lab user management moved to admin panel. Use admin endpoints.');
    }
    async getLabSettings(req) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        return this.settingsService.getLabSettings(labId);
    }
    async updateLabSettings(req, body) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        if (body.enableOnlineResults !== undefined ||
            body.onlineResultWatermarkDataUrl !== undefined ||
            body.onlineResultWatermarkText !== undefined ||
            body.reportBranding !== undefined) {
            throw new common_1.ForbiddenException('Online result and report design settings moved to admin panel.');
        }
        if (Object.keys(body).length === 0) {
            throw new common_1.BadRequestException('No settings provided');
        }
        return this.settingsService.updateLabSettings(labId, {
            labelSequenceBy: body.labelSequenceBy,
            sequenceResetBy: body.sequenceResetBy,
            printing: body.printing,
            uiTestGroups: body.uiTestGroups,
        });
    }
    async getUsers(req) {
        throw new common_1.ForbiddenException('Lab user management moved to admin panel. Use admin endpoints.');
    }
    async getUser(req, id) {
        throw new common_1.ForbiddenException('Lab user management moved to admin panel. Use admin endpoints.');
    }
    async createUser(req, body) {
        throw new common_1.ForbiddenException('Lab user management moved to admin panel. Use admin endpoints.');
    }
    async updateUser(req, id, body) {
        throw new common_1.ForbiddenException('Lab user management moved to admin panel. Use admin endpoints.');
    }
    async deleteUser(req, id) {
        throw new common_1.ForbiddenException('Lab user management moved to admin panel. Use admin endpoints.');
    }
};
exports.SettingsController = SettingsController;
__decorate([
    (0, common_1.Get)('roles'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "getRoles", null);
__decorate([
    (0, common_1.Get)('lab'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "getLabSettings", null);
__decorate([
    (0, common_1.Patch)('lab'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "updateLabSettings", null);
__decorate([
    (0, common_1.Get)('users'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "getUsers", null);
__decorate([
    (0, common_1.Get)('users/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "getUser", null);
__decorate([
    (0, common_1.Post)('users'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "createUser", null);
__decorate([
    (0, common_1.Patch)('users/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "updateUser", null);
__decorate([
    (0, common_1.Delete)('users/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "deleteUser", null);
exports.SettingsController = SettingsController = __decorate([
    (0, common_1.Controller)('settings'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('LAB_ADMIN', 'SUPER_ADMIN'),
    __metadata("design:paramtypes", [settings_service_1.SettingsService])
], SettingsController);
//# sourceMappingURL=settings.controller.js.map