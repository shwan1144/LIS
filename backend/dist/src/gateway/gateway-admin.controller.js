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
exports.GatewayAdminController = void 0;
const common_1 = require("@nestjs/common");
const admin_host_guard_1 = require("../tenant/admin-host.guard");
const admin_jwt_auth_guard_1 = require("../admin-auth/admin-jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const gateway_service_1 = require("./gateway.service");
const create_gateway_activation_code_dto_1 = require("./dto/create-gateway-activation-code.dto");
let GatewayAdminController = class GatewayAdminController {
    constructor(gatewayService) {
        this.gatewayService = gatewayService;
    }
    async createActivationCode(dto) {
        return this.gatewayService.createActivationCode(dto);
    }
};
exports.GatewayAdminController = GatewayAdminController;
__decorate([
    (0, common_1.Post)('activation-codes'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_gateway_activation_code_dto_1.CreateGatewayActivationCodeDto]),
    __metadata("design:returntype", Promise)
], GatewayAdminController.prototype, "createActivationCode", null);
exports.GatewayAdminController = GatewayAdminController = __decorate([
    (0, common_1.Controller)('admin/api/gateway'),
    (0, common_1.UseGuards)(admin_host_guard_1.AdminHostGuard, admin_jwt_auth_guard_1.AdminJwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __metadata("design:paramtypes", [gateway_service_1.GatewayService])
], GatewayAdminController);
//# sourceMappingURL=gateway-admin.controller.js.map