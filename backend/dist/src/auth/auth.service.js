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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const crypto_1 = require("crypto");
const user_entity_1 = require("../entities/user.entity");
const lab_entity_1 = require("../entities/lab.entity");
const platform_user_entity_1 = require("../entities/platform-user.entity");
const admin_lab_portal_token_entity_1 = require("../entities/admin-lab-portal-token.entity");
const audit_service_1 = require("../audit/audit.service");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const refresh_token_entity_1 = require("../entities/refresh-token.entity");
const refresh_token_service_1 = require("./refresh-token.service");
const password_util_1 = require("./password.util");
const auth_rate_limit_service_1 = require("./auth-rate-limit.service");
let AuthService = class AuthService {
    constructor(userRepository, labRepository, platformUserRepository, adminLabPortalTokenRepository, jwtService, auditService, refreshTokenService, authRateLimitService) {
        this.userRepository = userRepository;
        this.labRepository = labRepository;
        this.platformUserRepository = platformUserRepository;
        this.adminLabPortalTokenRepository = adminLabPortalTokenRepository;
        this.jwtService = jwtService;
        this.auditService = auditService;
        this.refreshTokenService = refreshTokenService;
        this.authRateLimitService = authRateLimitService;
    }
    async login(dto, params) {
        const resolvedLabId = params?.resolvedLabId ?? null;
        const username = dto.username.trim();
        await this.authRateLimitService.assertLabLoginAllowed({
            username,
            labId: resolvedLabId,
            ipAddress: params?.ipAddress ?? null,
        });
        const user = await this.findUserForLogin(username, resolvedLabId);
        if (!user) {
            await this.logFailedLogin(resolvedLabId, username, 'User not found', {
                ipAddress: params?.ipAddress ?? null,
                userAgent: params?.userAgent ?? null,
            });
            throw new common_1.UnauthorizedException('Invalid username or password');
        }
        const isPasswordValid = await (0, password_util_1.verifyPassword)(dto.password, user.passwordHash);
        if (!isPasswordValid) {
            await this.logFailedLogin(resolvedLabId, username, 'Password mismatch', {
                ipAddress: params?.ipAddress ?? null,
                userAgent: params?.userAgent ?? null,
            });
            throw new common_1.UnauthorizedException('Invalid username or password');
        }
        const lab = this.resolveLabForUser(user, resolvedLabId);
        if (!lab) {
            throw new common_1.UnauthorizedException('User has no lab assigned');
        }
        const payload = {
            sub: user.id,
            username: user.username,
            labId: lab.id,
            role: user.role,
            tokenType: 'lab_access',
        };
        const accessToken = this.jwtService.sign(payload);
        const refresh = await this.refreshTokenService.issue({
            actorType: refresh_token_entity_1.RefreshTokenActorType.LAB_USER,
            actorId: user.id,
            context: { labId: lab.id },
            ipAddress: params?.ipAddress ?? null,
            userAgent: params?.userAgent ?? null,
        });
        await this.auditService.log({
            actorType: audit_log_entity_1.AuditActorType.LAB_USER,
            actorId: user.id,
            labId: lab.id,
            userId: user.id,
            action: audit_log_entity_1.AuditAction.LOGIN,
            entityType: 'user',
            entityId: user.id,
            description: `User ${user.username} logged in`,
            ipAddress: params?.ipAddress ?? null,
            userAgent: params?.userAgent ?? null,
        });
        return {
            accessToken,
            refreshToken: refresh.token,
            user: this.toUserDto(user),
            lab: this.toLabDto(lab),
        };
    }
    async refreshLabToken(refreshToken, meta) {
        const rotated = await this.refreshTokenService.rotate(refreshToken, meta);
        if (rotated.actorType !== refresh_token_entity_1.RefreshTokenActorType.LAB_USER) {
            throw new common_1.UnauthorizedException('Invalid refresh token scope');
        }
        const user = await this.userRepository.findOne({
            where: { id: rotated.actorId, isActive: true },
            relations: ['defaultLab', 'labAssignments', 'labAssignments.lab', 'lab'],
        });
        if (!user) {
            throw new common_1.UnauthorizedException('User not found');
        }
        const contextLabId = rotated.context?.labId ?? null;
        if (meta?.resolvedLabId && contextLabId !== meta.resolvedLabId) {
            throw new common_1.UnauthorizedException('Refresh token lab context mismatch');
        }
        const lab = this.resolveLabForUser(user, contextLabId);
        if (!lab) {
            throw new common_1.UnauthorizedException('Lab not found for refresh token');
        }
        const payload = {
            sub: user.id,
            username: user.username,
            labId: lab.id,
            role: user.role,
            tokenType: 'lab_access',
        };
        return {
            accessToken: this.jwtService.sign(payload),
            refreshToken: rotated.issued.token,
            user: this.toUserDto(user),
            lab: this.toLabDto(lab),
        };
    }
    async logoutLabToken(refreshToken, resolvedLabId = null) {
        const token = await this.refreshTokenService.validate(refreshToken);
        if (token.actorType !== refresh_token_entity_1.RefreshTokenActorType.LAB_USER) {
            throw new common_1.UnauthorizedException('Invalid refresh token scope');
        }
        const contextLabId = token.context?.labId ?? null;
        if (resolvedLabId && contextLabId !== resolvedLabId) {
            throw new common_1.UnauthorizedException('Refresh token lab context mismatch');
        }
        await this.refreshTokenService.revoke(refreshToken);
    }
    async issueLabPortalBridgeToken(params) {
        const platformUser = await this.platformUserRepository.findOne({
            where: { id: params.platformUserId, isActive: true },
        });
        if (!platformUser) {
            throw new common_1.UnauthorizedException('Platform user not found');
        }
        if (platformUser.role !== platform_user_entity_1.PlatformUserRole.SUPER_ADMIN) {
            throw new common_1.UnauthorizedException('Only super admins can open lab panel');
        }
        const lab = await this.labRepository.findOne({
            where: { id: params.labId, isActive: true },
        });
        if (!lab) {
            throw new common_1.UnauthorizedException('Lab not found or disabled');
        }
        const secret = (0, crypto_1.randomBytes)(32).toString('base64url');
        const tokenRecord = this.adminLabPortalTokenRepository.create({
            id: (0, crypto_1.randomUUID)(),
            platformUserId: platformUser.id,
            labId: lab.id,
            tokenHash: this.hashLabPortalSecret(secret),
            expiresAt: new Date(Date.now() + this.getLabPortalBridgeTtlSeconds() * 1000),
            usedAt: null,
            createdIp: this.normalizeIpAddress(params.ipAddress),
            createdUserAgent: this.normalizeUserAgent(params.userAgent),
            usedIp: null,
            usedUserAgent: null,
        });
        await this.adminLabPortalTokenRepository.save(tokenRecord);
        await this.auditService.log({
            actorType: audit_log_entity_1.AuditActorType.PLATFORM_USER,
            actorId: platformUser.id,
            labId: lab.id,
            action: audit_log_entity_1.AuditAction.PLATFORM_SENSITIVE_READ,
            entityType: 'admin_lab_portal_token',
            entityId: tokenRecord.id,
            description: `Issued one-time lab portal token for ${lab.name} (${lab.code})`,
            newValues: {
                expiresAt: tokenRecord.expiresAt.toISOString(),
            },
            ipAddress: this.normalizeIpAddress(params.ipAddress),
            userAgent: this.normalizeUserAgent(params.userAgent),
        });
        return {
            bridgeToken: `${tokenRecord.id}.${secret}`,
            expiresAt: tokenRecord.expiresAt.toISOString(),
            lab: {
                id: lab.id,
                code: lab.code,
                name: lab.name,
                subdomain: lab.subdomain ?? null,
            },
        };
    }
    async loginWithLabPortalBridge(rawToken, params) {
        const parsedToken = this.parseLabPortalBridgeToken(rawToken);
        if (!parsedToken) {
            throw new common_1.UnauthorizedException('Invalid portal token');
        }
        const resolvedLabId = params?.resolvedLabId?.trim() || null;
        if (!resolvedLabId) {
            throw new common_1.UnauthorizedException('Lab context required');
        }
        const tokenRecord = await this.adminLabPortalTokenRepository.findOne({
            where: { id: parsedToken.tokenId },
        });
        if (!tokenRecord) {
            throw new common_1.UnauthorizedException('Invalid portal token');
        }
        const hashedSecret = this.hashLabPortalSecret(parsedToken.secret);
        if (!this.constantTimeHashMatch(tokenRecord.tokenHash, hashedSecret)) {
            throw new common_1.UnauthorizedException('Invalid portal token');
        }
        if (tokenRecord.usedAt) {
            throw new common_1.UnauthorizedException('Portal token already used');
        }
        if (tokenRecord.expiresAt.getTime() <= Date.now()) {
            throw new common_1.UnauthorizedException('Portal token expired');
        }
        if (tokenRecord.labId !== resolvedLabId) {
            throw new common_1.UnauthorizedException('Portal token lab mismatch');
        }
        const platformUser = await this.platformUserRepository.findOne({
            where: { id: tokenRecord.platformUserId, isActive: true },
        });
        if (!platformUser || platformUser.role !== platform_user_entity_1.PlatformUserRole.SUPER_ADMIN) {
            throw new common_1.UnauthorizedException('Platform user not allowed');
        }
        const lab = await this.labRepository.findOne({
            where: { id: tokenRecord.labId, isActive: true },
        });
        if (!lab) {
            throw new common_1.UnauthorizedException('Lab not found or disabled');
        }
        const usedAt = new Date();
        const updateResult = await this.adminLabPortalTokenRepository
            .createQueryBuilder()
            .update(admin_lab_portal_token_entity_1.AdminLabPortalToken)
            .set({
            usedAt,
            usedIp: this.normalizeIpAddress(params?.ipAddress),
            usedUserAgent: this.normalizeUserAgent(params?.userAgent),
        })
            .where('id = :id', { id: tokenRecord.id })
            .andWhere('"usedAt" IS NULL')
            .andWhere('"expiresAt" > :now', { now: usedAt.toISOString() })
            .execute();
        if ((updateResult.affected ?? 0) !== 1) {
            throw new common_1.UnauthorizedException('Portal token already used or expired');
        }
        const payload = {
            sub: platformUser.id,
            username: platformUser.email,
            labId: lab.id,
            role: platformUser.role,
            tokenType: 'lab_impersonation_access',
            platformUserId: platformUser.id,
        };
        const accessToken = this.jwtService.sign(payload);
        await this.auditService.log({
            actorType: audit_log_entity_1.AuditActorType.PLATFORM_USER,
            actorId: platformUser.id,
            labId: lab.id,
            action: audit_log_entity_1.AuditAction.PLATFORM_SENSITIVE_READ,
            entityType: 'admin_lab_portal_token',
            entityId: tokenRecord.id,
            description: `Opened lab panel via one-time token for ${lab.name} (${lab.code})`,
            ipAddress: this.normalizeIpAddress(params?.ipAddress),
            userAgent: this.normalizeUserAgent(params?.userAgent),
        });
        return {
            accessToken,
            user: {
                id: platformUser.id,
                username: platformUser.email,
                fullName: null,
                role: 'SUPER_ADMIN',
            },
            lab: this.toLabDto(lab),
        };
    }
    async findUserForLogin(username, resolvedLabId) {
        if (resolvedLabId) {
            return this.userRepository.findOne({
                where: { username, labId: resolvedLabId, isActive: true },
                relations: ['defaultLab', 'labAssignments', 'labAssignments.lab', 'lab'],
            });
        }
        return this.userRepository.findOne({
            where: { username, isActive: true },
            relations: ['defaultLab', 'labAssignments', 'labAssignments.lab', 'lab'],
        });
    }
    resolveLabForUser(user, resolvedLabId) {
        if (resolvedLabId) {
            if (user.labId === resolvedLabId && user.lab)
                return user.lab;
            if (user.defaultLabId === resolvedLabId && user.defaultLab)
                return user.defaultLab;
            const matched = user.labAssignments?.find((a) => a.labId === resolvedLabId);
            if (matched?.lab)
                return matched.lab;
            return null;
        }
        if (user.labId && user.lab) {
            return user.lab;
        }
        if (user.defaultLabId && user.defaultLab) {
            return user.defaultLab;
        }
        const firstAssignment = user.labAssignments?.[0];
        return firstAssignment?.lab ?? null;
    }
    getLabPortalBridgeTtlSeconds() {
        const parsed = Number(process.env.LAB_PORTAL_BRIDGE_TTL_SECONDS || 90);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return 90;
        }
        return Math.min(300, Math.floor(parsed));
    }
    parseLabPortalBridgeToken(rawToken) {
        const trimmed = rawToken.trim();
        if (!trimmed)
            return null;
        const parts = trimmed.split('.');
        if (parts.length !== 2)
            return null;
        const tokenId = parts[0]?.trim() ?? '';
        const secret = parts[1]?.trim() ?? '';
        if (!tokenId || !secret)
            return null;
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tokenId)) {
            return null;
        }
        if (secret.length < 20 || secret.length > 255) {
            return null;
        }
        return { tokenId, secret };
    }
    hashLabPortalSecret(secret) {
        return (0, crypto_1.createHash)('sha256').update(secret).digest('hex');
    }
    constantTimeHashMatch(expectedHex, candidateHex) {
        try {
            const expected = Buffer.from(expectedHex, 'hex');
            const candidate = Buffer.from(candidateHex, 'hex');
            if (expected.length === 0 ||
                candidate.length === 0 ||
                expected.length !== candidate.length) {
                return false;
            }
            return (0, crypto_1.timingSafeEqual)(expected, candidate);
        }
        catch {
            return false;
        }
    }
    normalizeIpAddress(value) {
        const ip = value?.trim();
        if (!ip)
            return null;
        return ip.slice(0, 45);
    }
    normalizeUserAgent(value) {
        const userAgent = value?.trim();
        if (!userAgent)
            return null;
        return userAgent.slice(0, 500);
    }
    async logFailedLogin(labId, username, reason, meta) {
        await this.auditService.log({
            actorType: audit_log_entity_1.AuditActorType.LAB_USER,
            actorId: null,
            labId,
            action: audit_log_entity_1.AuditAction.LOGIN_FAILED,
            entityType: 'user',
            entityId: null,
            description: `Failed login for ${username}: ${reason}`,
            newValues: {
                username,
                reason,
            },
            ipAddress: meta?.ipAddress ?? null,
            userAgent: meta?.userAgent ?? null,
        });
    }
    toUserDto(user) {
        return {
            id: user.id,
            username: user.username,
            fullName: user.fullName,
            role: user.role,
        };
    }
    toLabDto(lab) {
        return {
            id: lab.id,
            code: lab.code,
            name: lab.name,
            labelSequenceBy: lab.labelSequenceBy ?? 'tube_type',
            sequenceResetBy: lab.sequenceResetBy ?? 'day',
            enableOnlineResults: lab.enableOnlineResults !== false,
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(lab_entity_1.Lab)),
    __param(2, (0, typeorm_1.InjectRepository)(platform_user_entity_1.PlatformUser)),
    __param(3, (0, typeorm_1.InjectRepository)(admin_lab_portal_token_entity_1.AdminLabPortalToken)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        jwt_1.JwtService,
        audit_service_1.AuditService,
        refresh_token_service_1.RefreshTokenService,
        auth_rate_limit_service_1.AuthRateLimitService])
], AuthService);
//# sourceMappingURL=auth.service.js.map