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
exports.UnmatchedResultsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const unmatched_instrument_result_entity_1 = require("../entities/unmatched-instrument-result.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const panel_status_service_1 = require("../panels/panel-status.service");
const audit_service_1 = require("../audit/audit.service");
const audit_log_entity_1 = require("../entities/audit-log.entity");
let UnmatchedResultsService = class UnmatchedResultsService {
    constructor(unmatchedRepo, orderTestRepo, panelStatusService, auditService) {
        this.unmatchedRepo = unmatchedRepo;
        this.orderTestRepo = orderTestRepo;
        this.panelStatusService = panelStatusService;
        this.auditService = auditService;
    }
    async findAll(labId, params) {
        const page = params.page ?? 1;
        const size = params.size ?? 50;
        const skip = (page - 1) * size;
        const qb = this.unmatchedRepo
            .createQueryBuilder('u')
            .innerJoin('u.instrument', 'i')
            .where('i.labId = :labId', { labId })
            .orderBy('u.receivedAt', 'DESC');
        if (params.status) {
            qb.andWhere('u.status = :status', { status: params.status });
        }
        if (params.instrumentId) {
            qb.andWhere('u.instrumentId = :instrumentId', { instrumentId: params.instrumentId });
        }
        if (params.reason) {
            qb.andWhere('u.reason = :reason', { reason: params.reason });
        }
        const total = await qb.getCount();
        const items = await qb.skip(skip).take(size).getMany();
        return { items, total };
    }
    async findOne(id, labId) {
        const result = await this.unmatchedRepo.findOne({
            where: { id },
            relations: ['instrument'],
        });
        if (!result || result.instrument.labId !== labId) {
            throw new common_1.NotFoundException('Unmatched result not found');
        }
        return result;
    }
    async resolve(id, labId, actor, dto) {
        const unmatched = await this.findOne(id, labId);
        if (unmatched.status !== 'PENDING') {
            throw new Error(`Cannot resolve result with status: ${unmatched.status}`);
        }
        if (dto.action === 'ATTACH') {
            if (!dto.orderTestId) {
                throw new Error('orderTestId required for ATTACH action');
            }
            const orderTest = await this.orderTestRepo.findOne({
                where: { id: dto.orderTestId },
                relations: ['test', 'sample', 'sample.order'],
            });
            if (!orderTest) {
                throw new common_1.NotFoundException('OrderTest not found');
            }
            if (orderTest.sample.order.labId !== labId) {
                throw new Error('OrderTest does not belong to this lab');
            }
            const previousValue = orderTest.resultValue;
            const previousText = orderTest.resultText;
            orderTest.resultValue = unmatched.resultValue;
            orderTest.resultText = unmatched.resultText;
            orderTest.flag = unmatched.flag;
            orderTest.resultedAt = unmatched.receivedAt;
            orderTest.resultedBy = actor.userId;
            orderTest.status = order_test_entity_1.OrderTestStatus.COMPLETED;
            if (unmatched.unit) {
            }
            await this.orderTestRepo.save(orderTest);
            if (orderTest.parentOrderTestId) {
                await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
            }
            const impersonationAudit = actor.isImpersonation && actor.platformUserId
                ? {
                    impersonation: {
                        active: true,
                        platformUserId: actor.platformUserId,
                    },
                }
                : {};
            await this.auditService.log({
                actorType: actor.actorType,
                actorId: actor.actorId,
                labId,
                userId: actor.userId,
                action: audit_log_entity_1.AuditAction.RESULT_ENTER,
                entityType: 'order_test',
                entityId: orderTest.id,
                oldValues: previousValue !== null || previousText !== null
                    ? { resultValue: previousValue, resultText: previousText }
                    : null,
                newValues: {
                    resultValue: unmatched.resultValue,
                    resultText: unmatched.resultText,
                    flag: unmatched.flag,
                    source: 'unmatched_inbox',
                    unmatchedResultId: unmatched.id,
                    ...impersonationAudit,
                },
                description: `Result attached from unmatched inbox`,
            });
            unmatched.status = 'RESOLVED';
            unmatched.resolvedOrderTestId = orderTest.id;
            unmatched.resolvedBy = actor.userId;
            unmatched.resolvedAt = new Date();
            unmatched.resolutionNotes = dto.notes || null;
        }
        else if (dto.action === 'DISCARD') {
            unmatched.status = 'DISCARDED';
            unmatched.resolvedBy = actor.userId;
            unmatched.resolvedAt = new Date();
            unmatched.resolutionNotes = dto.notes || 'Discarded by user';
        }
        return this.unmatchedRepo.save(unmatched);
    }
    async getStats(labId, startDate, endDate) {
        const qb = this.unmatchedRepo
            .createQueryBuilder('u')
            .innerJoin('u.instrument', 'i')
            .where('i.labId = :labId', { labId });
        if (startDate && endDate) {
            qb.andWhere('u.receivedAt BETWEEN :startDate AND :endDate', { startDate, endDate });
        }
        else if (startDate) {
            qb.andWhere('u.receivedAt >= :startDate', { startDate });
        }
        else if (endDate) {
            qb.andWhere('u.receivedAt <= :endDate', { endDate });
        }
        const rows = await qb
            .select('u.status', 'status')
            .addSelect('u.reason', 'reason')
            .addSelect('COUNT(*)', 'count')
            .groupBy('u.status')
            .addGroupBy('u.reason')
            .getRawMany();
        const stats = {
            pending: 0,
            resolved: 0,
            discarded: 0,
            byReason: {},
        };
        for (const reason of Object.values(unmatched_instrument_result_entity_1.UnmatchedReason)) {
            stats.byReason[reason] = 0;
        }
        for (const row of rows) {
            const count = parseInt(row.count, 10) || 0;
            if (row.status === 'PENDING')
                stats.pending += count;
            else if (row.status === 'RESOLVED')
                stats.resolved += count;
            else if (row.status === 'DISCARDED')
                stats.discarded += count;
            if (row.reason in stats.byReason) {
                stats.byReason[row.reason] += count;
            }
        }
        return stats;
    }
    async getCountByInstrumentInPeriod(labId, startDate, endDate) {
        const rows = await this.unmatchedRepo
            .createQueryBuilder('u')
            .innerJoin('u.instrument', 'i')
            .select('i.id', 'instrumentId')
            .addSelect('MAX(COALESCE(i.name, i.code))', 'instrumentName')
            .addSelect('COUNT(*)', 'count')
            .where('i.labId = :labId', { labId })
            .andWhere('u.receivedAt BETWEEN :startDate AND :endDate', { startDate, endDate })
            .groupBy('i.id')
            .getRawMany();
        return rows.map((r) => ({
            instrumentId: r.instrumentId,
            instrumentName: String(r.instrumentName || r.instrumentId),
            count: parseInt(r.count, 10),
        }));
    }
};
exports.UnmatchedResultsService = UnmatchedResultsService;
exports.UnmatchedResultsService = UnmatchedResultsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(unmatched_instrument_result_entity_1.UnmatchedInstrumentResult)),
    __param(1, (0, typeorm_1.InjectRepository)(order_test_entity_1.OrderTest)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        panel_status_service_1.PanelStatusService,
        audit_service_1.AuditService])
], UnmatchedResultsService);
//# sourceMappingURL=unmatched-results.service.js.map