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
exports.LabApiController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const lab_host_guard_1 = require("../tenant/lab-host.guard");
const order_entity_1 = require("../entities/order.entity");
const create_lab_order_dto_1 = require("./dto/create-lab-order.dto");
const enter_result_dto_1 = require("./dto/enter-result.dto");
const upsert_patient_dto_1 = require("./dto/upsert-patient.dto");
const lab_api_service_1 = require("./lab-api.service");
const lab_actor_context_1 = require("../types/lab-actor-context");
let LabApiController = class LabApiController {
    constructor(labApiService) {
        this.labApiService = labApiService;
    }
    async searchPatients(req, q, page, size) {
        return this.labApiService.searchPatients(req.user.labId, {
            q,
            page: page ? parseInt(page, 10) : undefined,
            size: size ? parseInt(size, 10) : undefined,
        });
    }
    async upsertPatient(req, dto) {
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        return this.labApiService.upsertPatient(req.user.labId, dto, actor);
    }
    async createOrder(req, dto) {
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        return this.labApiService.createOrder(req.user.labId, dto, actor);
    }
    async listOrders(req, page, size, status) {
        return this.labApiService.listOrders(req.user.labId, {
            page: page ? parseInt(page, 10) : undefined,
            size: size ? parseInt(size, 10) : undefined,
            status,
        });
    }
    async enterResult(req, dto) {
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        return this.labApiService.enterResult(req.user.labId, dto, actor);
    }
    async exportOrder(req, id) {
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        return this.labApiService.exportOrderResultStub(req.user.labId, id, actor);
    }
};
exports.LabApiController = LabApiController;
__decorate([
    (0, common_1.Get)('patients'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('q')),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('size')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], LabApiController.prototype, "searchPatients", null);
__decorate([
    (0, common_1.Post)('patients'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, upsert_patient_dto_1.UpsertPatientDto]),
    __metadata("design:returntype", Promise)
], LabApiController.prototype, "upsertPatient", null);
__decorate([
    (0, common_1.Post)('orders'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_lab_order_dto_1.CreateLabOrderDto]),
    __metadata("design:returntype", Promise)
], LabApiController.prototype, "createOrder", null);
__decorate([
    (0, common_1.Get)('orders'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('size')),
    __param(3, (0, common_1.Query)('status', new common_1.ParseEnumPipe(order_entity_1.OrderStatus, { optional: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], LabApiController.prototype, "listOrders", null);
__decorate([
    (0, common_1.Post)('results'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, enter_result_dto_1.EnterResultDto]),
    __metadata("design:returntype", Promise)
], LabApiController.prototype, "enterResult", null);
__decorate([
    (0, common_1.Post)('orders/:id/export'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], LabApiController.prototype, "exportOrder", null);
exports.LabApiController = LabApiController = __decorate([
    (0, common_1.Controller)('api'),
    (0, common_1.UseGuards)(lab_host_guard_1.LabHostGuard, jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [lab_api_service_1.LabApiService])
], LabApiController);
//# sourceMappingURL=lab-api.controller.js.map