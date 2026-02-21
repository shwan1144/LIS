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
exports.AdminAuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const platform_user_entity_1 = require("../entities/platform-user.entity");
const refresh_token_entity_1 = require("../entities/refresh-token.entity");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const audit_service_1 = require("../audit/audit.service");
const refresh_token_service_1 = require("../auth/refresh-token.service");
const password_util_1 = require("../auth/password.util");
const auth_rate_limit_service_1 = require("../auth/auth-rate-limit.service");
let AdminAuthService = class AdminAuthService {
    constructor(platformUserRepo, jwtService, refreshTokenService, auditService, authRateLimitService) {
        this.platformUserRepo = platformUserRepo;
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
        this.auditService = auditService;
        this.authRateLimitService = authRateLimitService;
    }
    async login(dto, meta) {
        const email = dto.email.trim().toLowerCase();
        await this.authRateLimitService.assertPlatformLoginAllowed({
            email,
            ipAddress: meta?.ipAddress ?? null,
        });
        const platformUser = await this.platformUserRepo.findOne({
            where: { email, isActive: true },
        });
        if (!platformUser) {
            await this.logFailed(email, 'Platform user not found', meta);
            throw new common_1.UnauthorizedException('Invalid email or password');
        }
        const valid = await (0, password_util_1.verifyPassword)(dto.password, platformUser.passwordHash);
        if (!valid) {
            await this.logFailed(email, 'Password mismatch', meta);
            throw new common_1.UnauthorizedException('Invalid email or password');
        }
        const accessToken = this.issueAccessToken(platformUser);
        const refresh = await this.refreshTokenService.issue({
            actorType: refresh_token_entity_1.RefreshTokenActorType.PLATFORM_USER,
            actorId: platformUser.id,
            context: { role: platformUser.role },
            ipAddress: meta?.ipAddress ?? null,
            userAgent: meta?.userAgent ?? null,
        });
        await this.auditService.log({
            actorType: audit_log_entity_1.AuditActorType.PLATFORM_USER,
            actorId: platformUser.id,
            action: audit_log_entity_1.AuditAction.PLATFORM_LOGIN,
            entityType: 'platform_user',
            entityId: platformUser.id,
            description: `Platform user ${platformUser.email} logged in`,
            ipAddress: meta?.ipAddress ?? null,
            userAgent: meta?.userAgent ?? null,
        });
        return {
            accessToken,
            refreshToken: refresh.token,
            platformUser: this.toPlatformUserDto(platformUser),
        };
    }
    async refresh(refreshToken, meta) {
        const rotated = await this.refreshTokenService.rotate(refreshToken, meta);
        if (rotated.actorType !== refresh_token_entity_1.RefreshTokenActorType.PLATFORM_USER) {
            throw new common_1.UnauthorizedException('Invalid refresh token scope');
        }
        const platformUser = await this.platformUserRepo.findOne({
            where: { id: rotated.actorId, isActive: true },
        });
        if (!platformUser) {
            throw new common_1.UnauthorizedException('Platform user not found');
        }
        return {
            accessToken: this.issueAccessToken(platformUser),
            refreshToken: rotated.issued.token,
            platformUser: this.toPlatformUserDto(platformUser),
        };
    }
    async logout(refreshToken) {
        await this.refreshTokenService.revoke(refreshToken);
    }
    async issueAccessTokenByPlatformUserId(platformUserId, options) {
        const platformUser = await this.platformUserRepo.findOne({
            where: { id: platformUserId, isActive: true },
        });
        if (!platformUser) {
            throw new common_1.UnauthorizedException('Platform user not found');
        }
        return {
            accessToken: this.issueAccessToken(platformUser, options),
            platformUser: this.toPlatformUserDto(platformUser),
        };
    }
    issueAccessToken(platformUser, options) {
        const payload = this.buildAccessPayload(platformUser, options);
        return this.jwtService.sign(payload);
    }
    toPlatformUserDto(platformUser) {
        return {
            id: platformUser.id,
            email: platformUser.email,
            role: platformUser.role,
        };
    }
    buildAccessPayload(platformUser, options) {
        const payload = {
            sub: platformUser.id,
            email: platformUser.email,
            role: platformUser.role,
            tokenType: 'platform_access',
        };
        const impersonatedLabId = options?.impersonatedLabId?.trim();
        if (impersonatedLabId) {
            payload.impersonatedLabId = impersonatedLabId;
            payload.impersonationStartedAt = new Date().toISOString();
        }
        return payload;
    }
    async logFailed(email, reason, meta) {
        await this.auditService.log({
            actorType: audit_log_entity_1.AuditActorType.PLATFORM_USER,
            actorId: null,
            action: audit_log_entity_1.AuditAction.PLATFORM_LOGIN_FAILED,
            entityType: 'platform_user',
            entityId: null,
            description: `Failed platform login for ${email}: ${reason}`,
            newValues: {
                email,
                reason,
            },
            ipAddress: meta?.ipAddress ?? null,
            userAgent: meta?.userAgent ?? null,
        });
    }
};
exports.AdminAuthService = AdminAuthService;
exports.AdminAuthService = AdminAuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(platform_user_entity_1.PlatformUser)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        jwt_1.JwtService,
        refresh_token_service_1.RefreshTokenService,
        audit_service_1.AuditService,
        auth_rate_limit_service_1.AuthRateLimitService])
], AdminAuthService);
//# sourceMappingURL=admin-auth.service.js.map