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
exports.AntibioticsController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const antibiotics_service_1 = require("./antibiotics.service");
const create_antibiotic_dto_1 = require("./dto/create-antibiotic.dto");
const update_antibiotic_dto_1 = require("./dto/update-antibiotic.dto");
const roles_guard_1 = require("../auth/roles.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const lab_role_matrix_1 = require("../auth/lab-role-matrix");
let AntibioticsController = class AntibioticsController {
    constructor(antibioticsService) {
        this.antibioticsService = antibioticsService;
    }
    async findAll(req, includeInactive) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        return this.antibioticsService.findAll(labId, includeInactive === 'true');
    }
    async findOne(req, id) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        return this.antibioticsService.findOne(id, labId);
    }
    async create(req, dto) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        return this.antibioticsService.create(labId, dto);
    }
    async update(req, id, dto) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        return this.antibioticsService.update(id, labId, dto);
    }
    async remove(req, id) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found in token');
        await this.antibioticsService.softDelete(id, labId);
        return { success: true };
    }
};
exports.AntibioticsController = AntibioticsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ANTIBIOTICS_READ),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('includeInactive')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AntibioticsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ANTIBIOTICS_READ),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AntibioticsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ADMIN),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true, transform: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_antibiotic_dto_1.CreateAntibioticDto]),
    __metadata("design:returntype", Promise)
], AntibioticsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ADMIN),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true, transform: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_antibiotic_dto_1.UpdateAntibioticDto]),
    __metadata("design:returntype", Promise)
], AntibioticsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ADMIN),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AntibioticsController.prototype, "remove", null);
exports.AntibioticsController = AntibioticsController = __decorate([
    (0, common_1.Controller)('antibiotics'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [antibiotics_service_1.AntibioticsService])
], AntibioticsController);
//# sourceMappingURL=antibiotics.controller.js.map