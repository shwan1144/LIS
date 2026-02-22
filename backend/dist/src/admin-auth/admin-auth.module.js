"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const typeorm_1 = require("@nestjs/typeorm");
const platform_user_entity_1 = require("../entities/platform-user.entity");
const auth_module_1 = require("../auth/auth.module");
const admin_auth_controller_1 = require("./admin-auth.controller");
const admin_auth_service_1 = require("./admin-auth.service");
const admin_jwt_strategy_1 = require("./admin-jwt.strategy");
const admin_jwt_auth_guard_1 = require("./admin-jwt-auth.guard");
const security_env_1 = require("../config/security-env");
const platformJwtAccessTtlSeconds = Number(process.env.PLATFORM_JWT_ACCESS_TTL || 900);
const platformJwtSecret = (0, security_env_1.requireSecret)('PLATFORM_JWT_SECRET', 'platform-dev-secret', 'AdminAuthModule');
let AdminAuthModule = class AdminAuthModule {
};
exports.AdminAuthModule = AdminAuthModule;
exports.AdminAuthModule = AdminAuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([platform_user_entity_1.PlatformUser]),
            passport_1.PassportModule.register({ defaultStrategy: 'platform-jwt' }),
            jwt_1.JwtModule.register({
                secret: platformJwtSecret,
                signOptions: {
                    expiresIn: Number.isFinite(platformJwtAccessTtlSeconds) && platformJwtAccessTtlSeconds > 0
                        ? platformJwtAccessTtlSeconds
                        : 900,
                },
            }),
            auth_module_1.AuthModule,
        ],
        controllers: [admin_auth_controller_1.AdminAuthController],
        providers: [admin_auth_service_1.AdminAuthService, admin_jwt_strategy_1.AdminJwtStrategy, admin_jwt_auth_guard_1.AdminJwtAuthGuard],
        exports: [admin_auth_service_1.AdminAuthService, admin_jwt_auth_guard_1.AdminJwtAuthGuard],
    })
], AdminAuthModule);
//# sourceMappingURL=admin-auth.module.js.map