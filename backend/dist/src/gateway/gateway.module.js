"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const gateway_controller_1 = require("./gateway.controller");
const gateway_admin_controller_1 = require("./gateway-admin.controller");
const gateway_service_1 = require("./gateway.service");
const gateway_auth_guard_1 = require("./gateway-auth.guard");
const gateway_jwt_strategy_1 = require("./gateway-jwt.strategy");
const gateway_entity_1 = require("../entities/gateway.entity");
const instrument_entity_1 = require("../entities/instrument.entity");
const lab_entity_1 = require("../entities/lab.entity");
const auth_module_1 = require("../auth/auth.module");
const instruments_module_1 = require("../instruments/instruments.module");
const admin_auth_module_1 = require("../admin-auth/admin-auth.module");
const tenant_module_1 = require("../tenant/tenant.module");
let GatewayModule = class GatewayModule {
};
exports.GatewayModule = GatewayModule;
exports.GatewayModule = GatewayModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                gateway_entity_1.GatewayDevice,
                gateway_entity_1.GatewayActivationCode,
                gateway_entity_1.GatewayToken,
                gateway_entity_1.GatewayMessageReceipt,
                instrument_entity_1.Instrument,
                lab_entity_1.Lab,
            ]),
            auth_module_1.AuthModule,
            instruments_module_1.InstrumentsModule,
            admin_auth_module_1.AdminAuthModule,
            tenant_module_1.TenantModule,
        ],
        controllers: [gateway_controller_1.GatewayController, gateway_admin_controller_1.GatewayAdminController],
        providers: [gateway_service_1.GatewayService, gateway_jwt_strategy_1.GatewayJwtStrategy, gateway_auth_guard_1.GatewayAuthGuard],
        exports: [gateway_service_1.GatewayService],
    })
], GatewayModule);
//# sourceMappingURL=gateway.module.js.map