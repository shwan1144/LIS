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
exports.GatewayController = void 0;
const common_1 = require("@nestjs/common");
const gateway_service_1 = require("./gateway.service");
const gateway_auth_guard_1 = require("./gateway-auth.guard");
const activate_gateway_dto_1 = require("./dto/activate-gateway.dto");
const refresh_gateway_token_dto_1 = require("./dto/refresh-gateway-token.dto");
const gateway_message_dto_1 = require("./dto/gateway-message.dto");
const gateway_heartbeat_dto_1 = require("./dto/gateway-heartbeat.dto");
let GatewayController = class GatewayController {
    constructor(gatewayService) {
        this.gatewayService = gatewayService;
    }
    async activate(dto) {
        return this.gatewayService.activateGateway(dto);
    }
    async refreshToken(dto) {
        return this.gatewayService.refreshGatewayToken(dto);
    }
    async getConfig(req) {
        return this.gatewayService.getGatewayConfig(req.user);
    }
    async ingestMessage(req, dto) {
        return this.gatewayService.ingestGatewayMessage(req.user, dto);
    }
    async heartbeat(req, dto) {
        return this.gatewayService.recordHeartbeat(req.user, dto);
    }
};
exports.GatewayController = GatewayController;
__decorate([
    (0, common_1.Post)('activate'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [activate_gateway_dto_1.ActivateGatewayDto]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "activate", null);
__decorate([
    (0, common_1.Post)('token/refresh'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refresh_gateway_token_dto_1.RefreshGatewayTokenDto]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "refreshToken", null);
__decorate([
    (0, common_1.Get)('config'),
    (0, common_1.UseGuards)(gateway_auth_guard_1.GatewayAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "getConfig", null);
__decorate([
    (0, common_1.Post)('messages'),
    (0, common_1.UseGuards)(gateway_auth_guard_1.GatewayAuthGuard),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, gateway_message_dto_1.GatewayMessageDto]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "ingestMessage", null);
__decorate([
    (0, common_1.Post)('heartbeat'),
    (0, common_1.UseGuards)(gateway_auth_guard_1.GatewayAuthGuard),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, gateway_heartbeat_dto_1.GatewayHeartbeatDto]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "heartbeat", null);
exports.GatewayController = GatewayController = __decorate([
    (0, common_1.Controller)('gateway'),
    __metadata("design:paramtypes", [gateway_service_1.GatewayService])
], GatewayController);
//# sourceMappingURL=gateway.controller.js.map