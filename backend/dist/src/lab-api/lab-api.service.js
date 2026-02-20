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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LabApiService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const rls_session_service_1 = require("../database/rls-session.service");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const lab_entity_1 = require("../entities/lab.entity");
const order_entity_1 = require("../entities/order.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const patient_entity_1 = require("../entities/patient.entity");
const result_entity_1 = require("../entities/result.entity");
const sample_entity_1 = require("../entities/sample.entity");
const test_entity_1 = require("../entities/test.entity");
let LabApiService = class LabApiService {
    constructor(rlsSessionService, auditService) {
        this.rlsSessionService = rlsSessionService;
        this.auditService = auditService;
    }
    async searchPatients(labId, params) {
        return this.rlsSessionService.withLabContext(labId, async (manager) => {
            const page = Math.max(1, params.page ?? 1);
            const size = Math.min(100, Math.max(1, params.size ?? 20));
            const skip = (page - 1) * size;
            const qb = manager.getRepository(patient_entity_1.Patient).createQueryBuilder('p');
            if (params.q?.trim()) {
                const term = `%${params.q.trim()}%`;
                qb.andWhere('(p.fullName ILIKE :term OR p.patientNumber = :exact OR p.phone ILIKE :term OR p.nationalId ILIKE :term OR p.externalId ILIKE :term)', { term, exact: params.q.trim() });
            }
            qb.orderBy('p.updatedAt', 'DESC').skip(skip).take(size);
            const [items, total] = await qb.getManyAndCount();
            return {
                items,
                total,
                page,
                size,
                totalPages: Math.ceil(total / size),
            };
        });
    }
    async upsertPatient(labId, dto, actor) {
        return this.rlsSessionService.withLabContext(labId, async (manager) => {
            const patientRepo = manager.getRepository(patient_entity_1.Patient);
            const existing = await this.findExistingPatient(patientRepo.manager, dto);
            if (existing) {
                return { patient: existing, reused: true };
            }
            const patient = patientRepo.create({
                patientNumber: await this.generatePatientNumber(manager),
                nationalId: dto.nationalId?.trim() || null,
                phone: dto.phone?.trim() || null,
                externalId: dto.externalId?.trim() || null,
                fullName: dto.fullName.trim(),
                dateOfBirth: dto.dateOfBirth || null,
                sex: dto.sex?.trim() || null,
                address: dto.address?.trim() || null,
            });
            const saved = await patientRepo.save(patient);
            const impersonationAudit = actor?.isImpersonation && actor.platformUserId
                ? {
                    impersonation: {
                        active: true,
                        platformUserId: actor.platformUserId,
                    },
                }
                : {};
            await this.auditService.log({
                actorType: actor?.actorType ?? audit_log_entity_1.AuditActorType.LAB_USER,
                actorId: actor?.actorId ?? null,
                userId: actor?.userId ?? null,
                labId,
                action: audit_log_entity_1.AuditAction.PATIENT_CREATE,
                entityType: 'patient',
                entityId: saved.id,
                description: `Patient created via /api by lab ${labId}`,
                newValues: impersonationAudit,
            });
            return { patient: saved, reused: false };
        });
    }
    async createOrder(labId, dto, actor) {
        return this.rlsSessionService.withLabContext(labId, async (manager) => {
            const lab = await manager.getRepository(lab_entity_1.Lab).findOne({ where: { id: labId, isActive: true } });
            if (!lab) {
                throw new common_1.NotFoundException('Lab not found');
            }
            const patient = await manager.getRepository(patient_entity_1.Patient).findOne({ where: { id: dto.patientId } });
            if (!patient) {
                throw new common_1.NotFoundException('Patient not found');
            }
            const uniqueTestIds = [...new Set(dto.testIds)];
            const tests = await manager.getRepository(test_entity_1.Test).find({
                where: uniqueTestIds.map((id) => ({ id, isActive: true })),
            });
            if (tests.length !== uniqueTestIds.length) {
                throw new common_1.BadRequestException('One or more tests are invalid');
            }
            const orderNumber = await this.generateOrderNumber(manager, labId);
            const order = manager.getRepository(order_entity_1.Order).create({
                patientId: patient.id,
                labId,
                shiftId: dto.shiftId ?? null,
                orderNumber,
                status: order_entity_1.OrderStatus.REGISTERED,
                patientType: order_entity_1.PatientType.WALK_IN,
                notes: dto.notes?.trim() || null,
                totalAmount: 0,
                discountPercent: 0,
                finalAmount: 0,
            });
            const savedOrder = await manager.getRepository(order_entity_1.Order).save(order);
            const sample = manager.getRepository(sample_entity_1.Sample).create({
                labId,
                orderId: savedOrder.id,
                sampleId: null,
                barcode: orderNumber,
                sequenceNumber: null,
                qrCode: null,
                tubeType: null,
            });
            const savedSample = await manager.getRepository(sample_entity_1.Sample).save(sample);
            const orderTests = uniqueTestIds.map((testId) => manager.getRepository(order_test_entity_1.OrderTest).create({
                labId,
                sampleId: savedSample.id,
                testId,
                parentOrderTestId: null,
                status: order_test_entity_1.OrderTestStatus.PENDING,
                price: null,
            }));
            await manager.getRepository(order_test_entity_1.OrderTest).save(orderTests);
            const impersonationAudit = actor?.isImpersonation && actor.platformUserId
                ? {
                    impersonation: {
                        active: true,
                        platformUserId: actor.platformUserId,
                    },
                }
                : {};
            await this.auditService.log({
                actorType: actor?.actorType ?? audit_log_entity_1.AuditActorType.LAB_USER,
                actorId: actor?.actorId ?? null,
                userId: actor?.userId ?? null,
                labId,
                action: audit_log_entity_1.AuditAction.ORDER_CREATE,
                entityType: 'order',
                entityId: savedOrder.id,
                description: `Order ${savedOrder.orderNumber ?? savedOrder.id} created via /api`,
                newValues: impersonationAudit,
            });
            const fullOrder = await manager.getRepository(order_entity_1.Order).findOne({
                where: { id: savedOrder.id, labId },
                relations: ['patient', 'lab', 'shift', 'samples', 'samples.orderTests', 'samples.orderTests.test'],
            });
            if (!fullOrder) {
                throw new common_1.NotFoundException('Order not found after create');
            }
            return fullOrder;
        });
    }
    async listOrders(labId, params) {
        return this.rlsSessionService.withLabContext(labId, async (manager) => {
            const page = Math.max(1, params.page ?? 1);
            const size = Math.min(100, Math.max(1, params.size ?? 20));
            const skip = (page - 1) * size;
            const where = params.status ? { labId, status: params.status } : { labId };
            const [items, total] = await manager.getRepository(order_entity_1.Order).findAndCount({
                where,
                relations: ['patient', 'lab', 'shift'],
                order: { registeredAt: 'DESC' },
                skip,
                take: size,
            });
            return {
                items,
                total,
                page,
                size,
                totalPages: Math.ceil(total / size),
            };
        });
    }
    async enterResult(labId, dto, actor) {
        return this.rlsSessionService.withLabContext(labId, async (manager) => {
            const orderTestRepo = manager.getRepository(order_test_entity_1.OrderTest);
            const orderTest = await orderTestRepo.findOne({
                where: { id: dto.orderTestId, labId },
            });
            if (!orderTest) {
                throw new common_1.NotFoundException('Order test not found');
            }
            const now = new Date();
            const numericValue = Number(dto.value);
            orderTest.resultText = dto.value;
            orderTest.resultValue = Number.isFinite(numericValue) ? numericValue : null;
            orderTest.flag = this.toResultFlag(dto.flags);
            orderTest.resultedAt = now;
            orderTest.resultedBy = actor?.userId ?? null;
            if (orderTest.status !== order_test_entity_1.OrderTestStatus.VERIFIED) {
                orderTest.status = order_test_entity_1.OrderTestStatus.COMPLETED;
            }
            await orderTestRepo.save(orderTest);
            const result = manager.getRepository(result_entity_1.Result).create({
                labId,
                orderTestId: orderTest.id,
                analyteCode: dto.analyteCode?.trim() || null,
                value: dto.value,
                unit: dto.unit?.trim() || null,
                flags: dto.flags?.trim() || null,
                enteredAt: now,
                enteredByUserId: actor?.userId ?? null,
            });
            await manager.getRepository(result_entity_1.Result).save(result);
            await this.updateOrderStatusAfterResult(manager, labId, orderTest.sampleId);
            const impersonationAudit = actor?.isImpersonation && actor.platformUserId
                ? {
                    impersonation: {
                        active: true,
                        platformUserId: actor.platformUserId,
                    },
                }
                : {};
            await this.auditService.log({
                actorType: actor?.actorType ?? audit_log_entity_1.AuditActorType.LAB_USER,
                actorId: actor?.actorId ?? null,
                userId: actor?.userId ?? null,
                labId,
                action: audit_log_entity_1.AuditAction.RESULT_ENTER,
                entityType: 'order_test',
                entityId: orderTest.id,
                description: `Result entered for order test ${orderTest.id}`,
                newValues: impersonationAudit,
            });
            return orderTest;
        });
    }
    async exportOrderResultStub(labId, orderId, actor) {
        return this.rlsSessionService.withLabContext(labId, async (manager) => {
            const order = await manager.getRepository(order_entity_1.Order).findOne({
                where: { id: orderId, labId },
            });
            if (!order) {
                throw new common_1.NotFoundException('Order not found');
            }
            const impersonationAudit = actor?.isImpersonation && actor.platformUserId
                ? {
                    impersonation: {
                        active: true,
                        platformUserId: actor.platformUserId,
                    },
                }
                : {};
            await this.auditService.log({
                actorType: actor?.actorType ?? audit_log_entity_1.AuditActorType.LAB_USER,
                actorId: actor?.actorId ?? null,
                userId: actor?.userId ?? null,
                labId,
                action: audit_log_entity_1.AuditAction.REPORT_EXPORT,
                entityType: 'order',
                entityId: orderId,
                description: `Report export requested for order ${orderId}`,
                newValues: impersonationAudit,
            });
            return {
                status: 'stub',
                message: 'Export/print pipeline should be implemented by report service integration.',
                orderId,
            };
        });
    }
    async findExistingPatient(manager, dto) {
        const lookupKeys = this.getPatientLookupKeys();
        const qb = manager.getRepository(patient_entity_1.Patient).createQueryBuilder('p');
        let hasCondition = false;
        if (lookupKeys.includes('nationalId') && dto.nationalId?.trim()) {
            qb.where('p.nationalId = :nationalId', { nationalId: dto.nationalId.trim() });
            hasCondition = true;
        }
        if (lookupKeys.includes('phone') && dto.phone?.trim()) {
            if (hasCondition) {
                qb.orWhere('p.phone = :phone', { phone: dto.phone.trim() });
            }
            else {
                qb.where('p.phone = :phone', { phone: dto.phone.trim() });
                hasCondition = true;
            }
        }
        if (lookupKeys.includes('externalId') && dto.externalId?.trim()) {
            if (hasCondition) {
                qb.orWhere('p.externalId = :externalId', { externalId: dto.externalId.trim() });
            }
            else {
                qb.where('p.externalId = :externalId', { externalId: dto.externalId.trim() });
                hasCondition = true;
            }
        }
        if (!hasCondition) {
            return null;
        }
        return qb.getOne();
    }
    async generatePatientNumber(manager) {
        const raw = await manager
            .getRepository(patient_entity_1.Patient)
            .createQueryBuilder('p')
            .select('MAX(p.patientNumber)', 'maxNum')
            .where(`p.patientNumber LIKE 'P-%'`)
            .getRawOne();
        const maxValue = raw?.maxNum || 'P-000000';
        const current = parseInt(maxValue.replace(/^P-/, ''), 10) || 0;
        return `P-${String(current + 1).padStart(6, '0')}`;
    }
    async generateOrderNumber(manager, labId) {
        const today = new Date();
        const yy = String(today.getFullYear() % 100).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const datePrefix = `${yy}${mm}${dd}`;
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);
        const raw = await manager
            .getRepository(order_entity_1.Order)
            .createQueryBuilder('o')
            .select('COUNT(*)', 'count')
            .where('o.labId = :labId', { labId })
            .andWhere('o.registeredAt BETWEEN :startOfDay AND :endOfDay', { startOfDay, endOfDay })
            .getRawOne();
        const sequence = String((parseInt(raw?.count || '0', 10) || 0) + 1).padStart(3, '0');
        return `${datePrefix}${sequence}`;
    }
    toResultFlag(flag) {
        const value = (flag || '').trim().toUpperCase();
        if (value === order_test_entity_1.ResultFlag.NORMAL)
            return order_test_entity_1.ResultFlag.NORMAL;
        if (value === order_test_entity_1.ResultFlag.HIGH)
            return order_test_entity_1.ResultFlag.HIGH;
        if (value === order_test_entity_1.ResultFlag.LOW)
            return order_test_entity_1.ResultFlag.LOW;
        if (value === order_test_entity_1.ResultFlag.CRITICAL_HIGH)
            return order_test_entity_1.ResultFlag.CRITICAL_HIGH;
        if (value === order_test_entity_1.ResultFlag.CRITICAL_LOW)
            return order_test_entity_1.ResultFlag.CRITICAL_LOW;
        return null;
    }
    async updateOrderStatusAfterResult(manager, labId, sampleId) {
        const sample = await manager.getRepository(sample_entity_1.Sample).findOne({
            where: { id: sampleId, labId },
        });
        if (!sample)
            return;
        const pendingCount = await manager
            .getRepository(order_test_entity_1.OrderTest)
            .createQueryBuilder('ot')
            .where('ot.sampleId IN (SELECT s.id FROM samples s WHERE s.orderId = :orderId)', {
            orderId: sample.orderId,
        })
            .andWhere('ot.labId = :labId', { labId })
            .andWhere('ot.status IN (:...pending)', {
            pending: [order_test_entity_1.OrderTestStatus.PENDING, order_test_entity_1.OrderTestStatus.IN_PROGRESS],
        })
            .getCount();
        await manager.getRepository(order_entity_1.Order).update({ id: sample.orderId, labId }, { status: pendingCount === 0 ? order_entity_1.OrderStatus.COMPLETED : order_entity_1.OrderStatus.IN_PROGRESS });
    }
    getPatientLookupKeys() {
        const raw = (process.env.PATIENT_LOOKUP_KEYS || 'nationalId,phone,externalId').trim();
        return raw
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
    }
};
exports.LabApiService = LabApiService;
exports.LabApiService = LabApiService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [rls_session_service_1.RlsSessionService,
        audit_service_1.AuditService])
], LabApiService);
//# sourceMappingURL=lab-api.service.js.map