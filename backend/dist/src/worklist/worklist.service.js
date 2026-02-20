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
exports.WorklistService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const order_test_entity_1 = require("../entities/order-test.entity");
const order_entity_1 = require("../entities/order.entity");
const test_entity_1 = require("../entities/test.entity");
const user_department_assignment_entity_1 = require("../entities/user-department-assignment.entity");
const department_entity_1 = require("../entities/department.entity");
const audit_service_1 = require("../audit/audit.service");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const order_entity_2 = require("../entities/order.entity");
const panel_status_service_1 = require("../panels/panel-status.service");
function parseJsonField(val) {
    if (val == null)
        return null;
    if (typeof val === 'object')
        return val;
    if (typeof val === 'string') {
        try {
            return JSON.parse(val || 'null');
        }
        catch {
            return null;
        }
    }
    return null;
}
let WorklistService = class WorklistService {
    constructor(orderTestRepo, orderRepo, testRepo, userDeptRepo, departmentRepo, panelStatusService, auditService) {
        this.orderTestRepo = orderTestRepo;
        this.orderRepo = orderRepo;
        this.testRepo = testRepo;
        this.userDeptRepo = userDeptRepo;
        this.departmentRepo = departmentRepo;
        this.panelStatusService = panelStatusService;
        this.auditService = auditService;
    }
    async getWorklist(labId, params, userId) {
        const page = Math.max(1, params.page ?? 1);
        const size = Math.min(100, Math.max(1, params.size ?? 50));
        const skip = (page - 1) * size;
        const statuses = params.status?.length
            ? params.status
            : [order_test_entity_1.OrderTestStatus.PENDING, order_test_entity_1.OrderTestStatus.COMPLETED];
        let allowedDepartmentIds = null;
        if (userId) {
            const assignments = await this.userDeptRepo.find({
                where: { userId },
                relations: ['department'],
            });
            const forLab = assignments
                .filter((a) => a.department?.labId === labId)
                .map((a) => a.departmentId);
            if (forLab.length > 0)
                allowedDepartmentIds = forLab;
        }
        const qb = this.orderTestRepo
            .createQueryBuilder('ot')
            .innerJoin('ot.sample', 'sample')
            .innerJoin('sample.order', 'order')
            .innerJoin('order.patient', 'patient')
            .innerJoin('ot.test', 'test')
            .leftJoin('test.department', 'department')
            .where('order.labId = :labId', { labId })
            .andWhere('ot.status IN (:...statuses)', { statuses });
        if (allowedDepartmentIds && allowedDepartmentIds.length > 0) {
            qb.andWhere('test.departmentId IN (:...allowedDepartmentIds)', {
                allowedDepartmentIds,
            });
        }
        if (params.departmentId) {
            qb.andWhere('test.departmentId = :departmentId', {
                departmentId: params.departmentId,
            });
        }
        if (params.date) {
            const startDate = new Date(params.date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(params.date);
            endDate.setHours(23, 59, 59, 999);
            qb.andWhere('order.registeredAt BETWEEN :startDate AND :endDate', {
                startDate,
                endDate,
            });
        }
        if (params.search?.trim()) {
            const term = `%${params.search.trim()}%`;
            const exactSearch = params.search.trim();
            qb.andWhere('(order.orderNumber ILIKE :term OR patient.fullName ILIKE :term OR patient.patientNumber = :exactSearch OR test.code ILIKE :term)', { term, exactSearch });
        }
        qb.select([
            'ot.id AS id',
            'order.orderNumber AS "orderNumber"',
            'order.id AS "orderId"',
            'order.registeredAt AS "registeredAt"',
            'sample.id AS "sampleId"',
            'sample.tubeType AS "tubeType"',
            'patient.fullName AS "patientName"',
            'patient.sex AS "patientSex"',
            'patient.dateOfBirth AS "patientDob"',
            'test.code AS "testCode"',
            'test.name AS "testName"',
            'test.unit AS "testUnit"',
            'test.departmentId AS "departmentId"',
            'department.code AS "departmentCode"',
            'department.name AS "departmentName"',
            'test.normalMin AS "normalMin"',
            'test.normalMax AS "normalMax"',
            'test.normalMinMale AS "normalMinMale"',
            'test.normalMaxMale AS "normalMaxMale"',
            'test.normalMinFemale AS "normalMinFemale"',
            'test.normalMaxFemale AS "normalMaxFemale"',
            'test.normalText AS "normalText"',
            'ot.status AS status',
            'ot.resultValue AS "resultValue"',
            'ot.resultText AS "resultText"',
            'ot.resultParameters AS "resultParameters"',
            'ot.flag AS flag',
            'ot.resultedAt AS "resultedAt"',
            'ot.resultedBy AS "resultedBy"',
            'ot.verifiedAt AS "verifiedAt"',
            'ot.verifiedBy AS "verifiedBy"',
            'test.parameterDefinitions AS "parameterDefinitions"',
        ])
            .orderBy('order.registeredAt', 'ASC')
            .addOrderBy('test.sortOrder', 'ASC')
            .addOrderBy('test.code', 'ASC');
        const total = await qb.getCount();
        const rawItems = await qb.offset(skip).limit(size).getRawMany();
        const items = rawItems.map((item) => {
            let normalMin = item.normalMin ? parseFloat(item.normalMin) : null;
            let normalMax = item.normalMax ? parseFloat(item.normalMax) : null;
            if (item.patientSex === 'M') {
                if (item.normalMinMale !== null)
                    normalMin = parseFloat(item.normalMinMale);
                if (item.normalMaxMale !== null)
                    normalMax = parseFloat(item.normalMaxMale);
            }
            else if (item.patientSex === 'F') {
                if (item.normalMinFemale !== null)
                    normalMin = parseFloat(item.normalMinFemale);
                if (item.normalMaxFemale !== null)
                    normalMax = parseFloat(item.normalMaxFemale);
            }
            let patientAge = null;
            if (item.patientDob) {
                const dob = new Date(item.patientDob);
                const today = new Date();
                patientAge = today.getFullYear() - dob.getFullYear();
                const monthDiff = today.getMonth() - dob.getMonth();
                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
                    patientAge--;
                }
            }
            return {
                id: item.id,
                orderNumber: item.orderNumber,
                orderId: item.orderId,
                sampleId: item.sampleId,
                patientName: item.patientName,
                patientSex: item.patientSex,
                patientAge,
                testCode: item.testCode,
                testName: item.testName,
                testUnit: item.testUnit,
                normalMin,
                normalMax,
                normalText: item.normalText,
                tubeType: item.tubeType,
                status: item.status,
                resultValue: item.resultValue ? parseFloat(item.resultValue) : null,
                resultText: item.resultText,
                flag: item.flag,
                resultedAt: item.resultedAt,
                resultedBy: item.resultedBy ?? null,
                verifiedAt: item.verifiedAt,
                verifiedBy: item.verifiedBy ?? null,
                registeredAt: item.registeredAt,
                departmentId: item.departmentId ?? null,
                departmentCode: item.departmentCode ?? null,
                departmentName: item.departmentName ?? null,
                parameterDefinitions: parseJsonField(item.parameterDefinitions) ?? null,
                resultParameters: parseJsonField(item.resultParameters) ?? null,
            };
        });
        return { items, total };
    }
    async enterResult(orderTestId, labId, userId, data) {
        const orderTest = await this.orderTestRepo.findOne({
            where: { id: orderTestId },
            relations: ['sample', 'sample.order', 'test'],
        });
        if (!orderTest) {
            throw new common_1.NotFoundException('Order test not found');
        }
        if (orderTest.sample.order.labId !== labId) {
            throw new common_1.NotFoundException('Order test not found');
        }
        if (orderTest.status === order_test_entity_1.OrderTestStatus.VERIFIED) {
            throw new common_1.BadRequestException('Cannot modify a verified result');
        }
        if (data.resultValue !== undefined) {
            orderTest.resultValue = data.resultValue;
        }
        if (data.resultText !== undefined) {
            orderTest.resultText = data.resultText || null;
        }
        if (data.comments !== undefined) {
            orderTest.comments = data.comments || null;
        }
        if (data.resultParameters !== undefined) {
            orderTest.resultParameters = data.resultParameters && Object.keys(data.resultParameters).length > 0
                ? data.resultParameters
                : null;
        }
        orderTest.flag = this.calculateFlag(orderTest.resultValue, orderTest.test, orderTest.sample.order.patient?.sex || null);
        const isUpdate = orderTest.resultedAt !== null;
        orderTest.status = order_test_entity_1.OrderTestStatus.COMPLETED;
        orderTest.resultedAt = new Date();
        orderTest.resultedBy = userId ?? null;
        const saved = await this.orderTestRepo.save(orderTest);
        await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
        await this.syncOrderStatus(orderTest.sample.orderId);
        await this.auditService.log({
            labId,
            userId: userId ?? null,
            action: isUpdate ? audit_log_entity_1.AuditAction.RESULT_UPDATE : audit_log_entity_1.AuditAction.RESULT_ENTER,
            entityType: 'order_test',
            entityId: orderTestId,
            newValues: {
                resultValue: data.resultValue,
                resultText: data.resultText,
                flag: orderTest.flag,
            },
            description: `${isUpdate ? 'Updated' : 'Entered'} result for test ${orderTest.test?.code || orderTestId}`,
        });
        return saved;
    }
    async verifyResult(orderTestId, labId, userId) {
        const orderTest = await this.orderTestRepo.findOne({
            where: { id: orderTestId },
            relations: ['sample', 'sample.order', 'test'],
        });
        if (!orderTest) {
            throw new common_1.NotFoundException('Order test not found');
        }
        if (orderTest.sample.order.labId !== labId) {
            throw new common_1.NotFoundException('Order test not found');
        }
        if (orderTest.status === order_test_entity_1.OrderTestStatus.VERIFIED) {
            throw new common_1.BadRequestException('Result is already verified');
        }
        if (orderTest.status === order_test_entity_1.OrderTestStatus.PENDING) {
            throw new common_1.BadRequestException('Cannot verify a test without a result');
        }
        orderTest.status = order_test_entity_1.OrderTestStatus.VERIFIED;
        orderTest.verifiedAt = new Date();
        orderTest.verifiedBy = userId ?? null;
        const saved = await this.orderTestRepo.save(orderTest);
        await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
        await this.syncOrderStatus(orderTest.sample.orderId);
        await this.auditService.log({
            labId,
            userId: userId ?? null,
            action: audit_log_entity_1.AuditAction.RESULT_VERIFY,
            entityType: 'order_test',
            entityId: orderTestId,
            newValues: {
                resultValue: orderTest.resultValue,
                resultText: orderTest.resultText,
                flag: orderTest.flag,
                status: order_test_entity_1.OrderTestStatus.VERIFIED,
            },
            description: `Verified result for test ${orderTest.test?.code || orderTestId}`,
        });
        return saved;
    }
    async verifyMultiple(orderTestIds, labId, userId) {
        let verified = 0;
        let failed = 0;
        for (const id of orderTestIds) {
            try {
                await this.verifyResult(id, labId, userId);
                verified++;
            }
            catch {
                failed++;
            }
        }
        return { verified, failed };
    }
    async rejectResult(orderTestId, labId, userId, reason) {
        const orderTest = await this.orderTestRepo.findOne({
            where: { id: orderTestId },
            relations: ['sample', 'sample.order'],
        });
        if (!orderTest) {
            throw new common_1.NotFoundException('Order test not found');
        }
        if (orderTest.sample.order.labId !== labId) {
            throw new common_1.NotFoundException('Order test not found');
        }
        if (orderTest.status === order_test_entity_1.OrderTestStatus.VERIFIED) {
            throw new common_1.BadRequestException('Cannot reject a verified result');
        }
        orderTest.status = order_test_entity_1.OrderTestStatus.REJECTED;
        orderTest.rejectionReason = reason;
        orderTest.verifiedAt = new Date();
        orderTest.verifiedBy = userId ?? null;
        const saved = await this.orderTestRepo.save(orderTest);
        await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
        await this.syncOrderStatus(orderTest.sample.orderId);
        await this.auditService.log({
            labId,
            userId: userId ?? null,
            action: audit_log_entity_1.AuditAction.RESULT_REJECT,
            entityType: 'order_test',
            entityId: orderTestId,
            newValues: {
                status: order_test_entity_1.OrderTestStatus.REJECTED,
                rejectionReason: reason,
            },
            description: `Rejected result: ${reason}`,
        });
        return saved;
    }
    calculateFlag(resultValue, test, patientSex) {
        if (resultValue === null)
            return null;
        let normalMin = test.normalMin;
        let normalMax = test.normalMax;
        if (patientSex === 'M') {
            if (test.normalMinMale !== null)
                normalMin = test.normalMinMale;
            if (test.normalMaxMale !== null)
                normalMax = test.normalMaxMale;
        }
        else if (patientSex === 'F') {
            if (test.normalMinFemale !== null)
                normalMin = test.normalMinFemale;
            if (test.normalMaxFemale !== null)
                normalMax = test.normalMaxFemale;
        }
        if (normalMin === null && normalMax === null) {
            return null;
        }
        if (normalMax !== null && resultValue > parseFloat(normalMax.toString())) {
            const criticalThreshold = parseFloat(normalMax.toString()) * 1.5;
            if (resultValue > criticalThreshold) {
                return order_test_entity_1.ResultFlag.CRITICAL_HIGH;
            }
            return order_test_entity_1.ResultFlag.HIGH;
        }
        if (normalMin !== null && resultValue < parseFloat(normalMin.toString())) {
            const criticalThreshold = parseFloat(normalMin.toString()) * 0.5;
            if (resultValue < criticalThreshold) {
                return order_test_entity_1.ResultFlag.CRITICAL_LOW;
            }
            return order_test_entity_1.ResultFlag.LOW;
        }
        return order_test_entity_1.ResultFlag.NORMAL;
    }
    async getWorklistStats(labId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const qb = this.orderTestRepo
            .createQueryBuilder('ot')
            .innerJoin('ot.sample', 'sample')
            .innerJoin('sample.order', 'order')
            .where('order.labId = :labId', { labId })
            .andWhere('order.registeredAt >= :today', { today })
            .andWhere('order.registeredAt < :tomorrow', { tomorrow })
            .select('ot.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .groupBy('ot.status');
        const results = await qb.getRawMany();
        const stats = {
            pending: 0,
            completed: 0,
            verified: 0,
            rejected: 0,
        };
        for (const row of results) {
            const count = parseInt(row.count, 10);
            switch (row.status) {
                case order_test_entity_1.OrderTestStatus.PENDING:
                case order_test_entity_1.OrderTestStatus.IN_PROGRESS:
                    stats.pending += count;
                    break;
                case order_test_entity_1.OrderTestStatus.COMPLETED:
                    stats.completed += count;
                    break;
                case order_test_entity_1.OrderTestStatus.VERIFIED:
                    stats.verified += count;
                    break;
                case order_test_entity_1.OrderTestStatus.REJECTED:
                    stats.rejected += count;
                    break;
            }
        }
        return stats;
    }
    async syncOrderStatus(orderId) {
        const order = await this.orderRepo.findOne({ where: { id: orderId } });
        if (!order || order.status === order_entity_2.OrderStatus.CANCELLED) {
            return;
        }
        const tests = await this.orderTestRepo
            .createQueryBuilder('ot')
            .innerJoin('ot.sample', 'sample')
            .where('sample.orderId = :orderId', { orderId })
            .select(['ot.id AS id', 'ot.status AS status'])
            .getRawMany();
        if (tests.length === 0) {
            return;
        }
        const statuses = tests.map((t) => t.status);
        const allFinalized = statuses.every((s) => s === order_test_entity_1.OrderTestStatus.VERIFIED || s === order_test_entity_1.OrderTestStatus.REJECTED);
        const nextStatus = allFinalized ? order_entity_2.OrderStatus.COMPLETED : order_entity_2.OrderStatus.REGISTERED;
        if (order.status !== nextStatus) {
            order.status = nextStatus;
            await this.orderRepo.save(order);
        }
    }
};
exports.WorklistService = WorklistService;
exports.WorklistService = WorklistService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(order_test_entity_1.OrderTest)),
    __param(1, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(2, (0, typeorm_1.InjectRepository)(test_entity_1.Test)),
    __param(3, (0, typeorm_1.InjectRepository)(user_department_assignment_entity_1.UserDepartmentAssignment)),
    __param(4, (0, typeorm_1.InjectRepository)(department_entity_1.Department)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        panel_status_service_1.PanelStatusService,
        audit_service_1.AuditService])
], WorklistService);
//# sourceMappingURL=worklist.service.js.map