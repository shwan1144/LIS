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
exports.AuthRateLimitService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const audit_log_entity_1 = require("../entities/audit-log.entity");
let AuthRateLimitService = class AuthRateLimitService {
    constructor(auditLogRepo) {
        this.auditLogRepo = auditLogRepo;
        this.rateWindowSeconds = this.readPositiveInt('AUTH_LOGIN_RATE_WINDOW_SECONDS', 300);
        this.rateMaxAttemptsPerIp = this.readPositiveInt('AUTH_LOGIN_RATE_MAX_ATTEMPTS_PER_IP', 40);
        this.failedWindowSeconds = this.readPositiveInt('AUTH_LOGIN_FAILED_WINDOW_SECONDS', 900);
        this.failedMaxPerIp = this.readPositiveInt('AUTH_LOGIN_FAILED_MAX_PER_IP', 10);
        this.failedMaxPerIdentifier = this.readPositiveInt('AUTH_LOGIN_FAILED_MAX_PER_IDENTIFIER', 5);
    }
    async assertLabLoginAllowed(params) {
        const username = params.username?.trim();
        const ipAddress = params.ipAddress?.trim();
        const labScope = params.labId?.trim() || null;
        const rateCutoff = this.cutoff(this.rateWindowSeconds);
        const failedCutoff = this.cutoff(this.failedWindowSeconds);
        const [attemptsFromIp, failedFromIp, failedForAccount] = await Promise.all([
            ipAddress
                ? this.countByIp(audit_log_entity_1.AuditActorType.LAB_USER, [audit_log_entity_1.AuditAction.LOGIN, audit_log_entity_1.AuditAction.LOGIN_FAILED], rateCutoff, ipAddress)
                : Promise.resolve(0),
            ipAddress
                ? this.countByIp(audit_log_entity_1.AuditActorType.LAB_USER, [audit_log_entity_1.AuditAction.LOGIN_FAILED], failedCutoff, ipAddress)
                : Promise.resolve(0),
            username
                ? this.countFailedLabByIdentifier(username, labScope, failedCutoff)
                : Promise.resolve(0),
        ]);
        if (attemptsFromIp >= this.rateMaxAttemptsPerIp) {
            throw new common_1.HttpException(this.tooManyRequestsMessage('Too many login attempts from this IP', this.rateWindowSeconds), common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        if (failedFromIp >= this.failedMaxPerIp) {
            throw new common_1.HttpException(this.tooManyRequestsMessage('Too many failed login attempts from this IP', this.failedWindowSeconds), common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        if (failedForAccount >= this.failedMaxPerIdentifier) {
            throw new common_1.HttpException(this.tooManyRequestsMessage('Too many failed login attempts for this account', this.failedWindowSeconds), common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
    }
    async assertPlatformLoginAllowed(params) {
        const email = params.email?.trim().toLowerCase();
        const ipAddress = params.ipAddress?.trim();
        const rateCutoff = this.cutoff(this.rateWindowSeconds);
        const failedCutoff = this.cutoff(this.failedWindowSeconds);
        const [attemptsFromIp, failedFromIp, failedForAccount] = await Promise.all([
            ipAddress
                ? this.countByIp(audit_log_entity_1.AuditActorType.PLATFORM_USER, [audit_log_entity_1.AuditAction.PLATFORM_LOGIN, audit_log_entity_1.AuditAction.PLATFORM_LOGIN_FAILED], rateCutoff, ipAddress)
                : Promise.resolve(0),
            ipAddress
                ? this.countByIp(audit_log_entity_1.AuditActorType.PLATFORM_USER, [audit_log_entity_1.AuditAction.PLATFORM_LOGIN_FAILED], failedCutoff, ipAddress)
                : Promise.resolve(0),
            email ? this.countFailedPlatformByIdentifier(email, failedCutoff) : Promise.resolve(0),
        ]);
        if (attemptsFromIp >= this.rateMaxAttemptsPerIp) {
            throw new common_1.HttpException(this.tooManyRequestsMessage('Too many login attempts from this IP', this.rateWindowSeconds), common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        if (failedFromIp >= this.failedMaxPerIp) {
            throw new common_1.HttpException(this.tooManyRequestsMessage('Too many failed login attempts from this IP', this.failedWindowSeconds), common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        if (failedForAccount >= this.failedMaxPerIdentifier) {
            throw new common_1.HttpException(this.tooManyRequestsMessage('Too many failed login attempts for this account', this.failedWindowSeconds), common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
    }
    async countByIp(actorType, actions, cutoff, ipAddress) {
        const row = await this.auditLogRepo
            .createQueryBuilder('audit')
            .select('COUNT(*)', 'count')
            .where('audit."actorType" = :actorType', { actorType })
            .andWhere('audit."action" IN (:...actions)', { actions })
            .andWhere('audit."createdAt" >= :cutoff', { cutoff })
            .andWhere('audit."ipAddress" = :ipAddress', { ipAddress })
            .getRawOne();
        return Number(row?.count ?? 0);
    }
    async countFailedLabByIdentifier(username, labId, cutoff) {
        const row = await this.auditLogRepo
            .createQueryBuilder('audit')
            .select('COUNT(*)', 'count')
            .where('audit."actorType" = :actorType', { actorType: audit_log_entity_1.AuditActorType.LAB_USER })
            .andWhere('audit."action" = :action', { action: audit_log_entity_1.AuditAction.LOGIN_FAILED })
            .andWhere('audit."createdAt" >= :cutoff', { cutoff })
            .andWhere(`COALESCE(audit."labId"::text, '') = :labScope`, { labScope: labId ?? '' })
            .andWhere(`audit."newValues"->>'username' = :username`, { username })
            .getRawOne();
        return Number(row?.count ?? 0);
    }
    async countFailedPlatformByIdentifier(email, cutoff) {
        const row = await this.auditLogRepo
            .createQueryBuilder('audit')
            .select('COUNT(*)', 'count')
            .where('audit."actorType" = :actorType', { actorType: audit_log_entity_1.AuditActorType.PLATFORM_USER })
            .andWhere('audit."action" = :action', { action: audit_log_entity_1.AuditAction.PLATFORM_LOGIN_FAILED })
            .andWhere('audit."createdAt" >= :cutoff', { cutoff })
            .andWhere(`audit."newValues"->>'email' = :email`, { email })
            .getRawOne();
        return Number(row?.count ?? 0);
    }
    cutoff(windowSeconds) {
        return new Date(Date.now() - windowSeconds * 1000);
    }
    tooManyRequestsMessage(prefix, windowSeconds) {
        const minutes = Math.max(1, Math.ceil(windowSeconds / 60));
        return `${prefix}. Try again in about ${minutes} minute${minutes > 1 ? 's' : ''}.`;
    }
    readPositiveInt(key, fallback) {
        const value = Number(process.env[key]);
        if (!Number.isFinite(value) || value <= 0) {
            return fallback;
        }
        return Math.floor(value);
    }
};
exports.AuthRateLimitService = AuthRateLimitService;
exports.AuthRateLimitService = AuthRateLimitService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(audit_log_entity_1.AuditLog)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AuthRateLimitService);
//# sourceMappingURL=auth-rate-limit.service.js.map