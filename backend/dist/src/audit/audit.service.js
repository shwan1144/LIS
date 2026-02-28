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
exports.AuditService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const user_entity_1 = require("../entities/user.entity");
const lab_entity_1 = require("../entities/lab.entity");
const lab_timezone_util_1 = require("../database/lab-timezone.util");
let AuditService = class AuditService {
    constructor(auditLogRepo, userRepo, labRepo) {
        this.auditLogRepo = auditLogRepo;
        this.userRepo = userRepo;
        this.labRepo = labRepo;
    }
    async log(dto) {
        let normalizedUserId = dto.userId ?? null;
        if (normalizedUserId) {
            const userExists = await this.userRepo.exist({ where: { id: normalizedUserId } });
            if (!userExists) {
                normalizedUserId = null;
            }
        }
        const auditLog = this.auditLogRepo.create({
            actorType: dto.actorType ?? (normalizedUserId ? audit_log_entity_1.AuditActorType.LAB_USER : null),
            actorId: dto.actorId ?? normalizedUserId ?? null,
            labId: dto.labId ?? null,
            userId: normalizedUserId,
            action: dto.action,
            entityType: dto.entityType ?? null,
            entityId: dto.entityId ?? null,
            oldValues: dto.oldValues ?? null,
            newValues: dto.newValues ?? null,
            description: dto.description ?? null,
            ipAddress: dto.ipAddress ?? null,
            userAgent: dto.userAgent ?? null,
        });
        try {
            return await this.auditLogRepo.save(auditLog);
        }
        catch (error) {
            if (this.isForeignKeyViolation(error)) {
                const fallback = this.auditLogRepo.create({
                    actorType: dto.actorType ?? (normalizedUserId ? audit_log_entity_1.AuditActorType.LAB_USER : null),
                    actorId: dto.actorId ?? normalizedUserId ?? null,
                    labId: null,
                    userId: null,
                    action: dto.action,
                    entityType: dto.entityType ?? null,
                    entityId: dto.entityId ?? null,
                    oldValues: dto.oldValues ?? null,
                    newValues: dto.newValues ?? null,
                    description: dto.description ?? null,
                    ipAddress: dto.ipAddress ?? null,
                    userAgent: dto.userAgent ?? null,
                });
                return this.auditLogRepo.save(fallback);
            }
            throw error;
        }
    }
    isForeignKeyViolation(error) {
        if (!error || typeof error !== 'object')
            return false;
        const err = error;
        return err.code === '23503';
    }
    async findAll(labId, params) {
        const page = params.page ?? 1;
        const size = params.size ?? 50;
        const skip = (page - 1) * size;
        const qb = this.auditLogRepo
            .createQueryBuilder('audit')
            .leftJoinAndSelect('audit.user', 'user')
            .where('audit."labId" = :labId', { labId });
        const labTimeZone = await this.getLabTimeZone(labId);
        if (params.userId) {
            qb.andWhere('audit."userId" = :userId', { userId: params.userId });
        }
        if (params.action) {
            if (Array.isArray(params.action)) {
                qb.andWhere('audit."action" IN (:...actions)', { actions: params.action });
            }
            else {
                qb.andWhere('audit."action" = :action', { action: params.action });
            }
        }
        if (params.entityType) {
            qb.andWhere('audit."entityType" = :entityType', { entityType: params.entityType });
        }
        if (params.entityId) {
            qb.andWhere('audit."entityId" = :entityId', { entityId: params.entityId });
        }
        if (params.startDate && params.endDate) {
            const { startDate } = this.getDateRangeOrThrow(params.startDate, labTimeZone, 'startDate');
            const { endDate } = this.getDateRangeOrThrow(params.endDate, labTimeZone, 'endDate');
            if (startDate.getTime() > endDate.getTime()) {
                throw new common_1.BadRequestException('startDate cannot be after endDate');
            }
            qb.andWhere('audit."createdAt" BETWEEN :startDate AND :endDate', {
                startDate,
                endDate,
            });
        }
        else if (params.startDate) {
            const { startDate } = this.getDateRangeOrThrow(params.startDate, labTimeZone, 'startDate');
            qb.andWhere('audit."createdAt" >= :startDate', {
                startDate,
            });
        }
        else if (params.endDate) {
            const { endDate } = this.getDateRangeOrThrow(params.endDate, labTimeZone, 'endDate');
            qb.andWhere('audit."createdAt" <= :endDate', {
                endDate,
            });
        }
        if (params.search) {
            qb.andWhere('(audit."description" ILIKE :search OR user.username ILIKE :search OR user.fullName ILIKE :search)', { search: `%${params.search}%` });
        }
        const total = await qb.clone().getCount();
        const items = await qb
            .clone()
            .orderBy('audit.createdAt', 'DESC')
            .skip(skip)
            .take(size)
            .getMany();
        return { items, total };
    }
    async getLabTimeZone(labId) {
        const lab = await this.labRepo.findOne({ where: { id: labId } });
        return (0, lab_timezone_util_1.normalizeLabTimeZone)(lab?.timezone);
    }
    getDateRangeOrThrow(dateValue, timeZone, paramName) {
        try {
            const { startDate, endDate } = (0, lab_timezone_util_1.getUtcRangeForLabDate)(dateValue, timeZone);
            return { startDate, endDate };
        }
        catch {
            throw new common_1.BadRequestException(`Invalid ${paramName}. Expected YYYY-MM-DD.`);
        }
    }
    async getActions() {
        return Object.values(audit_log_entity_1.AuditAction);
    }
    async getEntityTypes(labId) {
        const result = await this.auditLogRepo
            .createQueryBuilder('audit')
            .select('DISTINCT audit."entityType"', 'entityType')
            .where('audit."labId" = :labId', { labId })
            .andWhere('audit."entityType" IS NOT NULL')
            .getRawMany();
        return result.map((r) => r.entityType).filter(Boolean);
    }
};
exports.AuditService = AuditService;
exports.AuditService = AuditService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(audit_log_entity_1.AuditLog)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(2, (0, typeorm_1.InjectRepository)(lab_entity_1.Lab)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], AuditService);
//# sourceMappingURL=audit.service.js.map