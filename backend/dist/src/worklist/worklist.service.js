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
const lab_entity_1 = require("../entities/lab.entity");
const user_department_assignment_entity_1 = require("../entities/user-department-assignment.entity");
const department_entity_1 = require("../entities/department.entity");
const audit_service_1 = require("../audit/audit.service");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const order_entity_2 = require("../entities/order.entity");
const panel_status_service_1 = require("../panels/panel-status.service");
const normal_range_util_1 = require("../tests/normal-range.util");
const lab_timezone_util_1 = require("../database/lab-timezone.util");
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
    constructor(orderTestRepo, orderRepo, testRepo, labRepo, userDeptRepo, departmentRepo, panelStatusService, auditService) {
        this.orderTestRepo = orderTestRepo;
        this.orderRepo = orderRepo;
        this.testRepo = testRepo;
        this.labRepo = labRepo;
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
            : [order_test_entity_1.OrderTestStatus.PENDING, order_test_entity_1.OrderTestStatus.COMPLETED, order_test_entity_1.OrderTestStatus.REJECTED];
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
        let startDate = null;
        let endDate = null;
        if (params.date) {
            const labTimeZone = await this.getLabTimeZone(labId);
            const dateRange = this.getDateRangeOrThrow(params.date, labTimeZone, 'date');
            startDate = dateRange.startDate;
            endDate = dateRange.endDate;
        }
        const buildBaseQuery = () => {
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
            return qb;
        };
        const totalRaw = await buildBaseQuery()
            .select('COUNT(DISTINCT order.id)', 'count')
            .getRawOne();
        const total = Number(totalRaw?.count ?? 0);
        const orderRows = await buildBaseQuery()
            .select('order.id', 'orderId')
            .addSelect('MAX(order.registeredAt)', 'registeredAt')
            .addSelect('MIN(CASE WHEN ot.status = :rejectedStatus THEN 0 ELSE 1 END)', 'rejectedPriority')
            .setParameter('rejectedStatus', order_test_entity_1.OrderTestStatus.REJECTED)
            .groupBy('order.id')
            .orderBy('"rejectedPriority"', 'ASC')
            .addOrderBy('"registeredAt"', 'DESC')
            .offset(skip)
            .limit(size)
            .getRawMany();
        const orderIds = orderRows.map((row) => row.orderId);
        if (orderIds.length === 0) {
            return { items: [], total };
        }
        const rawItems = await buildBaseQuery()
            .andWhere('order.id IN (:...orderIds)', { orderIds })
            .select([
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
            'test.type AS "testType"',
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
            'test.numericAgeRanges AS "numericAgeRanges"',
            'test.normalText AS "normalText"',
            'test.resultEntryType AS "resultEntryType"',
            'test.resultTextOptions AS "resultTextOptions"',
            'test.allowCustomResultText AS "allowCustomResultText"',
            'ot.status AS status',
            'ot.resultValue AS "resultValue"',
            'ot.resultText AS "resultText"',
            'ot.resultParameters AS "resultParameters"',
            'ot.rejectionReason AS "rejectionReason"',
            'ot.flag AS flag',
            'ot.resultedAt AS "resultedAt"',
            'ot.resultedBy AS "resultedBy"',
            'ot.verifiedAt AS "verifiedAt"',
            'ot.verifiedBy AS "verifiedBy"',
            'test.parameterDefinitions AS "parameterDefinitions"',
            'ot.parentOrderTestId AS "parentOrderTestId"',
            'ot.panelSortOrder AS "panelSortOrder"',
        ])
            .orderBy('CASE WHEN ot.status = :rejectedStatus THEN 0 ELSE 1 END', 'ASC')
            .addOrderBy('order.registeredAt', 'DESC')
            .addOrderBy('ot.panelSortOrder', 'ASC', 'NULLS LAST')
            .addOrderBy('test.sortOrder', 'ASC')
            .addOrderBy('test.code', 'ASC')
            .setParameter('rejectedStatus', order_test_entity_1.OrderTestStatus.REJECTED)
            .getRawMany();
        const items = rawItems.map((item) => {
            const patientAge = this.computePatientAgeYears(item.patientDob);
            const numericAgeRanges = parseJsonField(item.numericAgeRanges) ??
                null;
            const resolvedRange = (0, normal_range_util_1.resolveNumericRange)({
                normalMin: item.normalMin,
                normalMax: item.normalMax,
                normalMinMale: item.normalMinMale,
                normalMaxMale: item.normalMaxMale,
                normalMinFemale: item.normalMinFemale,
                normalMaxFemale: item.normalMaxFemale,
                numericAgeRanges,
            }, item.patientSex, patientAge);
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
                testType: item.testType,
                testUnit: item.testUnit,
                normalMin: resolvedRange.normalMin,
                normalMax: resolvedRange.normalMax,
                normalText: item.normalText,
                resultEntryType: this.normalizeResultEntryType(item.resultEntryType),
                resultTextOptions: parseJsonField(item.resultTextOptions) ??
                    null,
                allowCustomResultText: Boolean(item.allowCustomResultText),
                tubeType: item.tubeType,
                status: item.status,
                resultValue: item.resultValue !== null && item.resultValue !== undefined
                    ? parseFloat(item.resultValue)
                    : null,
                resultText: item.resultText,
                flag: item.flag,
                resultedAt: item.resultedAt,
                resultedBy: item.resultedBy ?? null,
                verifiedAt: item.verifiedAt,
                verifiedBy: item.verifiedBy ?? null,
                registeredAt: item.registeredAt,
                parentOrderTestId: item.parentOrderTestId ?? null,
                departmentId: item.departmentId ?? null,
                departmentCode: item.departmentCode ?? null,
                departmentName: item.departmentName ?? null,
                parameterDefinitions: parseJsonField(item.parameterDefinitions) ?? null,
                resultParameters: parseJsonField(item.resultParameters) ?? null,
                rejectionReason: item.rejectionReason ?? null,
                panelSortOrder: item.panelSortOrder != null ? Number(item.panelSortOrder) : null,
            };
        });
        return { items, total };
    }
    async enterResult(orderTestId, labId, actor, data, actorRole) {
        const orderTest = await this.orderTestRepo.findOne({
            where: { id: orderTestId },
            relations: ['sample', 'sample.order', 'sample.order.patient', 'test'],
        });
        if (!orderTest) {
            throw new common_1.NotFoundException('Order test not found');
        }
        if (orderTest.sample.order.labId !== labId) {
            throw new common_1.NotFoundException('Order test not found');
        }
        const forceEditVerified = data.forceEditVerified === true;
        const canForceEditVerified = actor.isImpersonation ||
            actorRole === 'LAB_ADMIN' ||
            actorRole === 'SUPER_ADMIN';
        const isVerifiedOverride = orderTest.status === order_test_entity_1.OrderTestStatus.VERIFIED &&
            forceEditVerified &&
            canForceEditVerified;
        if (orderTest.status === order_test_entity_1.OrderTestStatus.VERIFIED && !isVerifiedOverride) {
            throw new common_1.BadRequestException('Cannot modify a verified result');
        }
        if (data.resultValue !== undefined) {
            orderTest.resultValue = data.resultValue;
        }
        if (data.comments !== undefined) {
            orderTest.comments = data.comments || null;
        }
        if (data.resultParameters !== undefined) {
            orderTest.resultParameters = data.resultParameters && Object.keys(data.resultParameters).length > 0
                ? data.resultParameters
                : null;
        }
        const resultEntryType = this.normalizeResultEntryType(orderTest.test.resultEntryType);
        const resultTextOptions = this.normalizeResultTextOptions(orderTest.test.resultTextOptions);
        const normalizedResultTextInput = data.resultText !== undefined
            ? this.normalizeResultText(data.resultText)
            : undefined;
        if (resultEntryType === 'QUALITATIVE') {
            const candidateText = normalizedResultTextInput ?? this.normalizeResultText(orderTest.resultText);
            if (!candidateText) {
                throw new common_1.BadRequestException('Result text is required for qualitative tests');
            }
            const matchedOption = this.findMatchingResultTextOption(candidateText, resultTextOptions);
            if (!matchedOption && !orderTest.test.allowCustomResultText) {
                const allowedValues = (resultTextOptions ?? [])
                    .map((option) => option.value)
                    .join(', ');
                throw new common_1.BadRequestException(allowedValues.length
                    ? `Result must be one of: ${allowedValues}`
                    : 'No qualitative options are configured for this test');
            }
            orderTest.resultText = matchedOption?.value ?? candidateText;
            orderTest.resultValue = null;
            orderTest.flag = this.toResultFlag(matchedOption?.flag ?? null);
        }
        else if (resultEntryType === 'TEXT') {
            if (data.resultText !== undefined) {
                orderTest.resultText = normalizedResultTextInput ?? null;
            }
            orderTest.resultValue = null;
            orderTest.flag = this.resolveFlagFromResultText(orderTest.resultText, resultTextOptions);
        }
        else {
            if (data.resultText !== undefined) {
                orderTest.resultText = normalizedResultTextInput ?? null;
            }
            const optionFlag = this.resolveFlagFromResultText(orderTest.resultText, resultTextOptions);
            if (optionFlag) {
                orderTest.flag = optionFlag;
            }
            else {
                const patientAgeYears = this.computePatientAgeYears(orderTest.sample.order.patient?.dateOfBirth ?? null);
                orderTest.flag = this.calculateFlag(orderTest.resultValue, orderTest.test, orderTest.sample.order.patient?.sex || null, patientAgeYears);
            }
        }
        const isUpdate = orderTest.resultedAt !== null;
        orderTest.status = isVerifiedOverride
            ? order_test_entity_1.OrderTestStatus.VERIFIED
            : order_test_entity_1.OrderTestStatus.COMPLETED;
        orderTest.rejectionReason = null;
        orderTest.resultedAt = new Date();
        orderTest.resultedBy = actor.userId ?? orderTest.resultedBy;
        if (isVerifiedOverride) {
            orderTest.verifiedAt = new Date();
            orderTest.verifiedBy = actor.userId ?? orderTest.verifiedBy;
        }
        const saved = await this.orderTestRepo.save(orderTest);
        await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
        await this.syncOrderStatus(orderTest.sample.orderId);
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
            action: isUpdate ? audit_log_entity_1.AuditAction.RESULT_UPDATE : audit_log_entity_1.AuditAction.RESULT_ENTER,
            entityType: 'order_test',
            entityId: orderTestId,
            newValues: {
                resultValue: data.resultValue,
                resultText: data.resultText,
                flag: orderTest.flag,
                forceEditVerified: isVerifiedOverride,
                ...impersonationAudit,
            },
            description: isVerifiedOverride
                ? `Corrected verified result for test ${orderTest.test?.code || orderTestId}`
                : `${isUpdate ? 'Updated' : 'Entered'} result for test ${orderTest.test?.code || orderTestId}`,
        });
        return saved;
    }
    async batchEnterResults(labId, actor, actorRole, updates) {
        if (!updates.length)
            return [];
        const orderTestIds = updates.map((u) => u.orderTestId);
        const orderTests = await this.orderTestRepo.find({
            where: { id: (0, typeorm_2.In)(orderTestIds) },
            relations: ['sample', 'sample.order', 'sample.order.patient', 'test'],
        });
        const orderTestsMap = new Map(orderTests.map((ot) => [ot.id, ot]));
        const toSave = [];
        const updatedOrderIds = new Set();
        const updatedParentIds = new Set();
        const auditLogs = [];
        for (const data of updates) {
            const orderTest = orderTestsMap.get(data.orderTestId);
            if (!orderTest || orderTest.sample.order.labId !== labId) {
                continue;
            }
            const forceEditVerified = data.forceEditVerified === true;
            const canForceEditVerified = actor.isImpersonation || actorRole === 'LAB_ADMIN' || actorRole === 'SUPER_ADMIN';
            const isVerifiedOverride = orderTest.status === order_test_entity_1.OrderTestStatus.VERIFIED && forceEditVerified && canForceEditVerified;
            if (orderTest.status === order_test_entity_1.OrderTestStatus.VERIFIED && !isVerifiedOverride) {
                continue;
            }
            if (data.resultValue !== undefined) {
                orderTest.resultValue = data.resultValue;
            }
            if (data.comments !== undefined) {
                orderTest.comments = data.comments || null;
            }
            if (data.resultParameters !== undefined) {
                orderTest.resultParameters =
                    data.resultParameters && Object.keys(data.resultParameters).length > 0
                        ? data.resultParameters
                        : null;
            }
            const resultEntryType = this.normalizeResultEntryType(orderTest.test.resultEntryType);
            const resultTextOptions = this.normalizeResultTextOptions(orderTest.test.resultTextOptions);
            const normalizedResultTextInput = data.resultText !== undefined ? this.normalizeResultText(data.resultText) : undefined;
            if (resultEntryType === 'QUALITATIVE') {
                const candidateText = normalizedResultTextInput ?? this.normalizeResultText(orderTest.resultText);
                if (!candidateText)
                    continue;
                const matchedOption = this.findMatchingResultTextOption(candidateText, resultTextOptions);
                if (!matchedOption && !orderTest.test.allowCustomResultText)
                    continue;
                orderTest.resultText = matchedOption?.value ?? candidateText;
                orderTest.resultValue = null;
                orderTest.flag = this.toResultFlag(matchedOption?.flag ?? null);
            }
            else if (resultEntryType === 'TEXT') {
                if (data.resultText !== undefined) {
                    orderTest.resultText = normalizedResultTextInput ?? null;
                }
                orderTest.resultValue = null;
                orderTest.flag = this.resolveFlagFromResultText(orderTest.resultText, resultTextOptions);
            }
            else {
                if (data.resultText !== undefined) {
                    orderTest.resultText = normalizedResultTextInput ?? null;
                }
                const optionFlag = this.resolveFlagFromResultText(orderTest.resultText, resultTextOptions);
                if (optionFlag) {
                    orderTest.flag = optionFlag;
                }
                else {
                    const patientAgeYears = this.computePatientAgeYears(orderTest.sample.order.patient?.dateOfBirth ?? null);
                    orderTest.flag = this.calculateFlag(orderTest.resultValue, orderTest.test, orderTest.sample.order.patient?.sex || null, patientAgeYears);
                }
            }
            const isUpdate = orderTest.resultedAt !== null;
            orderTest.status = isVerifiedOverride ? order_test_entity_1.OrderTestStatus.VERIFIED : order_test_entity_1.OrderTestStatus.COMPLETED;
            orderTest.rejectionReason = null;
            orderTest.resultedAt = new Date();
            orderTest.resultedBy = actor.userId ?? orderTest.resultedBy;
            if (isVerifiedOverride) {
                orderTest.verifiedAt = new Date();
                orderTest.verifiedBy = actor.userId ?? orderTest.verifiedBy;
            }
            toSave.push(orderTest);
            updatedOrderIds.add(orderTest.sample.orderId);
            updatedParentIds.add(orderTest.parentOrderTestId || orderTest.id);
            const impersonationAudit = actor.isImpersonation && actor.platformUserId
                ? {
                    impersonation: {
                        active: true,
                        platformUserId: actor.platformUserId,
                    },
                }
                : {};
            auditLogs.push({
                actorType: actor.actorType,
                actorId: actor.actorId,
                labId,
                userId: actor.userId,
                action: isUpdate ? audit_log_entity_1.AuditAction.RESULT_UPDATE : audit_log_entity_1.AuditAction.RESULT_ENTER,
                entityType: 'order_test',
                entityId: orderTest.id,
                newValues: {
                    resultValue: data.resultValue,
                    resultText: data.resultText,
                    flag: orderTest.flag,
                    forceEditVerified: isVerifiedOverride,
                    ...impersonationAudit,
                },
                description: isVerifiedOverride
                    ? `Corrected verified result for test ${orderTest.test?.code || orderTest.id}`
                    : `${isUpdate ? 'Updated' : 'Entered'} result for test ${orderTest.test?.code || orderTest.id}`,
            });
        }
        if (toSave.length > 0) {
            await this.orderTestRepo.save(toSave);
            for (const pid of updatedParentIds) {
                await this.panelStatusService.recomputeAfterChildUpdate(pid);
            }
            for (const oid of updatedOrderIds) {
                await this.syncOrderStatus(oid);
            }
            for (const log of auditLogs) {
                await this.auditService.log(log);
            }
        }
        return toSave;
    }
    async verifyResult(orderTestId, labId, actor) {
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
        orderTest.verifiedBy = actor.userId;
        const saved = await this.orderTestRepo.save(orderTest);
        await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
        await this.syncOrderStatus(orderTest.sample.orderId);
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
            action: audit_log_entity_1.AuditAction.RESULT_VERIFY,
            entityType: 'order_test',
            entityId: orderTestId,
            newValues: {
                resultValue: orderTest.resultValue,
                resultText: orderTest.resultText,
                flag: orderTest.flag,
                status: order_test_entity_1.OrderTestStatus.VERIFIED,
                ...impersonationAudit,
            },
            description: `Verified result for test ${orderTest.test?.code || orderTestId}`,
        });
        return saved;
    }
    async verifyMultiple(orderTestIds, labId, actor) {
        if (!orderTestIds.length)
            return { verified: 0, failed: 0 };
        const orderTests = await this.orderTestRepo.find({
            where: { id: (0, typeorm_2.In)(orderTestIds) },
            relations: ['sample', 'sample.order', 'test'],
        });
        const toSave = [];
        const updatedOrderIds = new Set();
        const updatedParentIds = new Set();
        const auditLogs = [];
        let failed = 0;
        for (const ot of orderTests) {
            if (ot.sample.order.labId !== labId || ot.status === order_test_entity_1.OrderTestStatus.VERIFIED || ot.status === order_test_entity_1.OrderTestStatus.PENDING) {
                failed++;
                continue;
            }
            ot.status = order_test_entity_1.OrderTestStatus.VERIFIED;
            ot.verifiedAt = new Date();
            ot.verifiedBy = actor.userId;
            toSave.push(ot);
            updatedOrderIds.add(ot.sample.orderId);
            updatedParentIds.add(ot.parentOrderTestId || ot.id);
            const impersonationAudit = actor.isImpersonation && actor.platformUserId ? {
                impersonation: { active: true, platformUserId: actor.platformUserId },
            } : {};
            auditLogs.push({
                actorType: actor.actorType,
                actorId: actor.actorId,
                labId,
                userId: actor.userId,
                action: audit_log_entity_1.AuditAction.RESULT_VERIFY,
                entityType: 'order_test',
                entityId: ot.id,
                newValues: {
                    resultValue: ot.resultValue,
                    resultText: ot.resultText,
                    flag: ot.flag,
                    status: order_test_entity_1.OrderTestStatus.VERIFIED,
                    ...impersonationAudit,
                },
                description: `Verified result for test ${ot.test?.code || ot.id}`,
            });
        }
        if (toSave.length > 0) {
            await this.orderTestRepo.save(toSave);
            for (const pid of updatedParentIds) {
                await this.panelStatusService.recomputeAfterChildUpdate(pid);
            }
            for (const oid of updatedOrderIds) {
                await this.syncOrderStatus(oid);
            }
            for (const log of auditLogs) {
                await this.auditService.log(log);
            }
        }
        return { verified: toSave.length, failed };
    }
    async rejectResult(orderTestId, labId, actor, reason) {
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
        orderTest.verifiedBy = actor.userId;
        const saved = await this.orderTestRepo.save(orderTest);
        await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
        await this.syncOrderStatus(orderTest.sample.orderId);
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
            action: audit_log_entity_1.AuditAction.RESULT_REJECT,
            entityType: 'order_test',
            entityId: orderTestId,
            newValues: {
                status: order_test_entity_1.OrderTestStatus.REJECTED,
                rejectionReason: reason,
                ...impersonationAudit,
            },
            description: `Rejected result: ${reason}`,
        });
        return saved;
    }
    normalizeResultEntryType(value) {
        const normalized = String(value || 'NUMERIC').trim().toUpperCase();
        if (normalized === 'NUMERIC' ||
            normalized === 'QUALITATIVE' ||
            normalized === 'TEXT') {
            return normalized;
        }
        return 'NUMERIC';
    }
    normalizeResultText(value) {
        const normalized = String(value ?? '').trim();
        return normalized.length ? normalized : null;
    }
    normalizeResultTextOptions(options) {
        if (!options || !Array.isArray(options))
            return null;
        const normalized = options
            .map((option) => ({
            value: this.normalizeResultText(option?.value),
            flag: this.toResultFlag(option?.flag ?? null),
            isDefault: Boolean(option?.isDefault),
        }))
            .filter((option) => Boolean(option.value))
            .map((option) => ({
            value: option.value,
            flag: option.flag,
            isDefault: option.isDefault,
        }));
        return normalized.length ? normalized : null;
    }
    findMatchingResultTextOption(text, options) {
        if (!options?.length)
            return null;
        const candidate = text.trim().toLowerCase();
        return (options.find((option) => option.value.trim().toLowerCase() === candidate) ??
            null);
    }
    resolveFlagFromResultText(resultText, options) {
        if (!resultText || !options?.length)
            return null;
        const matched = this.findMatchingResultTextOption(resultText, options);
        return this.toResultFlag(matched?.flag ?? null);
    }
    toResultFlag(flag) {
        const normalized = String(flag ?? '').trim().toUpperCase();
        if (!normalized)
            return null;
        if (normalized === order_test_entity_1.ResultFlag.NORMAL)
            return order_test_entity_1.ResultFlag.NORMAL;
        if (normalized === order_test_entity_1.ResultFlag.HIGH)
            return order_test_entity_1.ResultFlag.HIGH;
        if (normalized === order_test_entity_1.ResultFlag.LOW)
            return order_test_entity_1.ResultFlag.LOW;
        if (normalized === order_test_entity_1.ResultFlag.CRITICAL_HIGH)
            return order_test_entity_1.ResultFlag.CRITICAL_HIGH;
        if (normalized === order_test_entity_1.ResultFlag.CRITICAL_LOW)
            return order_test_entity_1.ResultFlag.CRITICAL_LOW;
        if (normalized === order_test_entity_1.ResultFlag.POSITIVE)
            return order_test_entity_1.ResultFlag.POSITIVE;
        if (normalized === order_test_entity_1.ResultFlag.NEGATIVE)
            return order_test_entity_1.ResultFlag.NEGATIVE;
        if (normalized === order_test_entity_1.ResultFlag.ABNORMAL)
            return order_test_entity_1.ResultFlag.ABNORMAL;
        return null;
    }
    calculateFlag(resultValue, test, patientSex, patientAgeYears) {
        if (resultValue === null)
            return null;
        const { normalMin, normalMax } = (0, normal_range_util_1.resolveNumericRange)(test, patientSex, patientAgeYears);
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
    computePatientAgeYears(dateOfBirth) {
        if (!dateOfBirth)
            return null;
        const dob = new Date(dateOfBirth);
        if (Number.isNaN(dob.getTime()))
            return null;
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
            age--;
        }
        return age < 0 ? null : age;
    }
    async getWorklistStats(labId) {
        const labTimeZone = await this.getLabTimeZone(labId);
        const todayDateKey = (0, lab_timezone_util_1.formatDateKeyForTimeZone)(new Date(), labTimeZone);
        const { startDate: today, endExclusive: tomorrow } = (0, lab_timezone_util_1.getUtcRangeForLabDate)(todayDateKey, labTimeZone);
        const qb = this.orderTestRepo
            .createQueryBuilder('ot')
            .innerJoin('ot.sample', 'sample')
            .innerJoin('sample.order', 'order')
            .where('order.labId = :labId', { labId })
            .andWhere('order.registeredAt >= :today', { today })
            .andWhere('order.registeredAt < :tomorrow', { tomorrow })
            .andWhere('ot."parentOrderTestId" IS NULL')
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
    __param(3, (0, typeorm_1.InjectRepository)(lab_entity_1.Lab)),
    __param(4, (0, typeorm_1.InjectRepository)(user_department_assignment_entity_1.UserDepartmentAssignment)),
    __param(5, (0, typeorm_1.InjectRepository)(department_entity_1.Department)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        panel_status_service_1.PanelStatusService,
        audit_service_1.AuditService])
], WorklistService);
//# sourceMappingURL=worklist.service.js.map