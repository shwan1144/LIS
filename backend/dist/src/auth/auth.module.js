"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const typeorm_1 = require("@nestjs/typeorm");
const user_entity_1 = require("../entities/user.entity");
const refresh_token_entity_1 = require("../entities/refresh-token.entity");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const lab_entity_1 = require("../entities/lab.entity");
const platform_user_entity_1 = require("../entities/platform-user.entity");
const admin_lab_portal_token_entity_1 = require("../entities/admin-lab-portal-token.entity");
const auth_service_1 = require("./auth.service");
const auth_controller_1 = require("./auth.controller");
const jwt_strategy_1 = require("./jwt.strategy");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const roles_guard_1 = require("./roles.guard");
const refresh_token_service_1 = require("./refresh-token.service");
const auth_rate_limit_service_1 = require("./auth-rate-limit.service");
const jwtAccessTtlSeconds = Number(process.env.JWT_ACCESS_TTL || 900);
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                user_entity_1.User,
                refresh_token_entity_1.RefreshToken,
                audit_log_entity_1.AuditLog,
                lab_entity_1.Lab,
                platform_user_entity_1.PlatformUser,
                admin_lab_portal_token_entity_1.AdminLabPortalToken,
            ]),
            passport_1.PassportModule.register({ defaultStrategy: 'lab-jwt' }),
            jwt_1.JwtModule.register({
                secret: process.env.JWT_SECRET || 'lis-dev-secret-change-in-production',
                signOptions: {
                    expiresIn: Number.isFinite(jwtAccessTtlSeconds) && jwtAccessTtlSeconds > 0 ? jwtAccessTtlSeconds : 900,
                },
            }),
        ],
        controllers: [auth_controller_1.AuthController],
        providers: [
            auth_service_1.AuthService,
            jwt_strategy_1.JwtStrategy,
            jwt_auth_guard_1.JwtAuthGuard,
            roles_guard_1.RolesGuard,
            refresh_token_service_1.RefreshTokenService,
            auth_rate_limit_service_1.AuthRateLimitService,
        ],
        exports: [
            auth_service_1.AuthService,
            jwt_1.JwtModule,
            jwt_auth_guard_1.JwtAuthGuard,
            roles_guard_1.RolesGuard,
            refresh_token_service_1.RefreshTokenService,
            auth_rate_limit_service_1.AuthRateLimitService,
        ],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map