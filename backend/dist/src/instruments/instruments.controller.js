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
exports.InstrumentsController = void 0;
const common_1 = require("@nestjs/common");
const instruments_service_1 = require("./instruments.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let InstrumentsController = class InstrumentsController {
    constructor(instrumentsService) {
        this.instrumentsService = instrumentsService;
    }
    async findAll(req) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        return this.instrumentsService.findAll(labId);
    }
    async getMappingsByTest(req, testId) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        return this.instrumentsService.getMappingsByTestId(testId, labId);
    }
    async findOne(req, id) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        return this.instrumentsService.findOne(id, labId);
    }
    async create(req, dto) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        return this.instrumentsService.create(labId, dto);
    }
    async update(req, id, dto) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        return this.instrumentsService.update(id, labId, dto);
    }
    async delete(req, id) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        return this.instrumentsService.delete(id, labId);
    }
    async toggleActive(req, id) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        return this.instrumentsService.toggleActive(id, labId);
    }
    async restartConnection(req, id) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        const success = await this.instrumentsService.restartConnection(id, labId);
        return { success };
    }
    async getMappings(req, id) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        return this.instrumentsService.getMappings(id, labId);
    }
    async createMapping(req, id, dto) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        return this.instrumentsService.createMapping(id, labId, dto);
    }
    async updateMapping(req, id, mappingId, dto) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        return this.instrumentsService.updateMapping(id, mappingId, labId, dto);
    }
    async deleteMapping(req, id, mappingId) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        return this.instrumentsService.deleteMapping(id, mappingId, labId);
    }
    async getMessages(req, id, page, size, direction) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        return this.instrumentsService.getMessages(id, labId, {
            page: page ? parseInt(page, 10) : undefined,
            size: size ? parseInt(size, 10) : undefined,
            direction,
        });
    }
    async simulateMessage(req, id, body) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        return this.instrumentsService.simulateMessage(id, labId, body.rawMessage);
    }
};
exports.InstrumentsController = InstrumentsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InstrumentsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('mappings-by-test/:testId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('testId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], InstrumentsController.prototype, "getMappingsByTest", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], InstrumentsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], InstrumentsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], InstrumentsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], InstrumentsController.prototype, "delete", null);
__decorate([
    (0, common_1.Patch)(':id/toggle-active'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], InstrumentsController.prototype, "toggleActive", null);
__decorate([
    (0, common_1.Post)(':id/restart'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], InstrumentsController.prototype, "restartConnection", null);
__decorate([
    (0, common_1.Get)(':id/mappings'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], InstrumentsController.prototype, "getMappings", null);
__decorate([
    (0, common_1.Post)(':id/mappings'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], InstrumentsController.prototype, "createMapping", null);
__decorate([
    (0, common_1.Patch)(':id/mappings/:mappingId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('mappingId', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], InstrumentsController.prototype, "updateMapping", null);
__decorate([
    (0, common_1.Delete)(':id/mappings/:mappingId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('mappingId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], InstrumentsController.prototype, "deleteMapping", null);
__decorate([
    (0, common_1.Get)(':id/messages'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('size')),
    __param(4, (0, common_1.Query)('direction')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", Promise)
], InstrumentsController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Post)(':id/simulate'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], InstrumentsController.prototype, "simulateMessage", null);
exports.InstrumentsController = InstrumentsController = __decorate([
    (0, common_1.Controller)('instruments'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [instruments_service_1.InstrumentsService])
], InstrumentsController);
//# sourceMappingURL=instruments.controller.js.map