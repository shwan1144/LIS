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
exports.RefreshTokenService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const crypto_1 = require("crypto");
const refresh_token_entity_1 = require("../entities/refresh-token.entity");
const password_util_1 = require("./password.util");
const REFRESH_TOKEN_TTL_DAYS = 30;
let RefreshTokenService = class RefreshTokenService {
    constructor(refreshTokenRepo) {
        this.refreshTokenRepo = refreshTokenRepo;
    }
    async issue(params) {
        return this.issueWithRepository(this.refreshTokenRepo, params);
    }
    async issueWithRepository(repo, params) {
        const tokenId = (0, crypto_1.randomUUID)();
        const familyId = params.familyId ?? (0, crypto_1.randomUUID)();
        const tokenSecret = this.generateTokenSecret();
        const tokenHash = await (0, password_util_1.hashPassword)(tokenSecret);
        const expiresAt = this.buildExpiryDate();
        const tokenRecord = repo.create({
            id: tokenId,
            actorType: params.actorType,
            actorId: params.actorId,
            familyId,
            tokenHash,
            expiresAt,
            revokedAt: null,
            replacedByTokenId: null,
            context: params.context ?? null,
            createdIp: params.ipAddress ?? null,
            createdUserAgent: params.userAgent ?? null,
        });
        await repo.save(tokenRecord);
        return {
            token: this.composeRawToken(tokenId, tokenSecret),
            tokenId,
            familyId,
            expiresAt,
        };
    }
    async rotate(rawToken, meta) {
        const { tokenId, tokenSecret } = this.parseRawToken(rawToken);
        return this.refreshTokenRepo.manager.transaction(async (manager) => {
            const repo = manager.getRepository(refresh_token_entity_1.RefreshToken);
            const existing = await repo
                .createQueryBuilder('token')
                .setLock('pessimistic_write')
                .where('token.id = :id', { id: tokenId })
                .getOne();
            if (!existing) {
                throw new common_1.UnauthorizedException('Invalid refresh token');
            }
            if (existing.revokedAt) {
                await this.revokeFamilyWithRepository(repo, existing.familyId);
                throw new common_1.UnauthorizedException('Refresh token reuse detected');
            }
            if (existing.expiresAt.getTime() <= Date.now()) {
                existing.revokedAt = new Date();
                await repo.save(existing);
                throw new common_1.UnauthorizedException('Refresh token expired');
            }
            const isValid = await (0, password_util_1.verifyPassword)(tokenSecret, existing.tokenHash);
            if (!isValid) {
                throw new common_1.UnauthorizedException('Invalid refresh token');
            }
            const next = await this.issueWithRepository(repo, {
                actorType: existing.actorType,
                actorId: existing.actorId,
                familyId: existing.familyId,
                context: existing.context ?? null,
                ipAddress: meta?.ipAddress ?? null,
                userAgent: meta?.userAgent ?? null,
            });
            existing.revokedAt = new Date();
            existing.replacedByTokenId = next.tokenId;
            await repo.save(existing);
            return {
                actorType: existing.actorType,
                actorId: existing.actorId,
                context: existing.context ?? null,
                issued: next,
            };
        });
    }
    async revoke(rawToken) {
        const { tokenId } = this.parseRawToken(rawToken);
        await this.revokeToken(tokenId);
    }
    async validate(rawToken) {
        const { tokenId, tokenSecret } = this.parseRawToken(rawToken);
        const existing = await this.refreshTokenRepo.findOne({ where: { id: tokenId } });
        if (!existing) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        if (existing.revokedAt) {
            throw new common_1.UnauthorizedException('Refresh token already revoked');
        }
        if (existing.expiresAt.getTime() <= Date.now()) {
            await this.revokeToken(existing.id);
            throw new common_1.UnauthorizedException('Refresh token expired');
        }
        const isValid = await (0, password_util_1.verifyPassword)(tokenSecret, existing.tokenHash);
        if (!isValid) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        return {
            tokenId: existing.id,
            actorType: existing.actorType,
            actorId: existing.actorId,
            familyId: existing.familyId,
            context: existing.context ?? null,
            expiresAt: existing.expiresAt,
        };
    }
    async revokeFamily(familyId) {
        await this.revokeFamilyWithRepository(this.refreshTokenRepo, familyId);
    }
    async revokeFamilyWithRepository(repo, familyId) {
        await repo.update({ familyId, revokedAt: (0, typeorm_2.IsNull)() }, { revokedAt: new Date() });
    }
    async revokeToken(tokenId) {
        await this.refreshTokenRepo.update({ id: tokenId, revokedAt: (0, typeorm_2.IsNull)() }, { revokedAt: new Date() });
    }
    composeRawToken(tokenId, tokenSecret) {
        return `${tokenId}.${tokenSecret}`;
    }
    parseRawToken(rawToken) {
        const [tokenId, tokenSecret] = (rawToken || '').split('.');
        if (!tokenId || !tokenSecret) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        return { tokenId, tokenSecret };
    }
    generateTokenSecret() {
        return (0, crypto_1.randomBytes)(48).toString('base64url');
    }
    buildExpiryDate() {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);
        return expiresAt;
    }
};
exports.RefreshTokenService = RefreshTokenService;
exports.RefreshTokenService = RefreshTokenService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(refresh_token_entity_1.RefreshToken)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], RefreshTokenService);
//# sourceMappingURL=refresh-token.service.js.map