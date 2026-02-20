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
exports.TestsController = void 0;
const common_1 = require("@nestjs/common");
const tests_service_1 = require("./tests.service");
const create_test_dto_1 = require("./dto/create-test.dto");
const update_test_dto_1 = require("./dto/update-test.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let TestsController = class TestsController {
    constructor(testsService) {
        this.testsService = testsService;
    }
    async findAll(req, active) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        const activeOnly = active === 'true';
        return this.testsService.findAll(labId, activeOnly);
    }
    async seedAll(req) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        const cbc = await this.testsService.seedCBCTests(labId);
        const chem = await this.testsService.seedChemistryTests(labId);
        return {
            cbc,
            chemistry: chem,
            total: { created: cbc.created + chem.created, skipped: cbc.skipped + chem.skipped },
        };
    }
    async seedCBC(req) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        return this.testsService.seedCBCTests(labId);
    }
    async seedChemistry(req) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        return this.testsService.seedChemistryTests(labId);
    }
    async getPricing(req, id) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        return this.testsService.getPricingForTest(id, labId);
    }
    async setPricing(req, id, body) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        await this.testsService.setPricingForTest(id, labId, body.prices ?? []);
        return { success: true };
    }
    async findOne(req, id) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        return this.testsService.findOne(id, labId);
    }
    async create(req, dto) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        return this.testsService.create(labId, dto);
    }
    async update(req, id, dto) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        return this.testsService.update(id, labId, dto);
    }
    async delete(req, id) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        await this.testsService.delete(id, labId);
        return { success: true };
    }
    async toggleActive(req, id) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        return this.testsService.toggleActive(id, labId);
    }
};
exports.TestsController = TestsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('active')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TestsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)('seed/all'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TestsController.prototype, "seedAll", null);
__decorate([
    (0, common_1.Post)('seed/cbc'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TestsController.prototype, "seedCBC", null);
__decorate([
    (0, common_1.Post)('seed/chemistry'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TestsController.prototype, "seedChemistry", null);
__decorate([
    (0, common_1.Get)(':id/pricing'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TestsController.prototype, "getPricing", null);
__decorate([
    (0, common_1.Patch)(':id/pricing'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], TestsController.prototype, "setPricing", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TestsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true, transform: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_test_dto_1.CreateTestDto]),
    __metadata("design:returntype", Promise)
], TestsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true, transform: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_test_dto_1.UpdateTestDto]),
    __metadata("design:returntype", Promise)
], TestsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TestsController.prototype, "delete", null);
__decorate([
    (0, common_1.Patch)(':id/toggle-active'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TestsController.prototype, "toggleActive", null);
exports.TestsController = TestsController = __decorate([
    (0, common_1.Controller)('tests'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [tests_service_1.TestsService])
], TestsController);
//# sourceMappingURL=tests.controller.js.map