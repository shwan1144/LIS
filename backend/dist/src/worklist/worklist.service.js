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
var WorklistService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorklistService = exports.WorklistVerificationStatus = exports.WorklistEntryStatus = exports.WorklistOrderMode = exports.WorklistView = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const order_test_entity_1 = require("../entities/order-test.entity");
const order_entity_1 = require("../entities/order.entity");
const test_entity_1 = require("../entities/test.entity");
const antibiotic_entity_1 = require("../entities/antibiotic.entity");
const lab_entity_1 = require("../entities/lab.entity");
const test_antibiotic_entity_1 = require("../entities/test-antibiotic.entity");
const user_department_assignment_entity_1 = require("../entities/user-department-assignment.entity");
const department_entity_1 = require("../entities/department.entity");
const audit_service_1 = require("../audit/audit.service");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const panel_status_service_1 = require("../panels/panel-status.service");
const normal_range_util_1 = require("../tests/normal-range.util");
const lab_timezone_util_1 = require("../database/lab-timezone.util");
const patient_age_util_1 = require("../patients/patient-age.util");
const order_test_result_util_1 = require("../order-tests/order-test-result.util");
const order_test_flag_util_1 = require("../order-tests/order-test-flag.util");
const result_documents_service_1 = require("../result-documents/result-documents.service");
const reports_service_1 = require("../reports/reports.service");
var WorklistView;
(function (WorklistView) {
    WorklistView["FULL"] = "full";
    WorklistView["VERIFY"] = "verify";
})(WorklistView || (exports.WorklistView = WorklistView = {}));
var WorklistOrderMode;
(function (WorklistOrderMode) {
    WorklistOrderMode["ENTRY"] = "entry";
    WorklistOrderMode["VERIFY"] = "verify";
})(WorklistOrderMode || (exports.WorklistOrderMode = WorklistOrderMode = {}));
var WorklistEntryStatus;
(function (WorklistEntryStatus) {
    WorklistEntryStatus["PENDING"] = "pending";
    WorklistEntryStatus["COMPLETED"] = "completed";
})(WorklistEntryStatus || (exports.WorklistEntryStatus = WorklistEntryStatus = {}));
var WorklistVerificationStatus;
(function (WorklistVerificationStatus) {
    WorklistVerificationStatus["UNVERIFIED"] = "unverified";
    WorklistVerificationStatus["VERIFIED"] = "verified";
})(WorklistVerificationStatus || (exports.WorklistVerificationStatus = WorklistVerificationStatus = {}));
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
let WorklistService = WorklistService_1 = class WorklistService {
    constructor(orderTestRepo, orderRepo, testRepo, testAntibioticRepo, antibioticRepo, labRepo, userDeptRepo, departmentRepo, panelStatusService, auditService, resultDocumentsService, reportsService) {
        this.orderTestRepo = orderTestRepo;
        this.orderRepo = orderRepo;
        this.testRepo = testRepo;
        this.testAntibioticRepo = testAntibioticRepo;
        this.antibioticRepo = antibioticRepo;
        this.labRepo = labRepo;
        this.userDeptRepo = userDeptRepo;
        this.departmentRepo = departmentRepo;
        this.panelStatusService = panelStatusService;
        this.auditService = auditService;
        this.resultDocumentsService = resultDocumentsService;
        this.reportsService = reportsService;
        this.logger = new common_1.Logger(WorklistService_1.name);
        this.worklistPerfLogThresholdMs = this.resolveWorklistPerfLogThresholdMs();
    }
    triggerReportStorageSync(orderId, labId, context) {
        this.reportsService.syncReportToS3(orderId, labId).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            const stack = error instanceof Error ? error.stack : undefined;
            this.logger.error(`Failed to sync stored report for order ${orderId} after ${context}: ${message}`, stack);
        });
    }
    async getWorklist(labId, params, userId) {
        const startedAt = process.hrtime.bigint();
        const page = Math.max(1, params.page ?? 1);
        const size = Math.min(100, Math.max(1, params.size ?? 50));
        const skip = (page - 1) * size;
        const view = params.view ?? WorklistView.FULL;
        let total = 0;
        let itemsCount = 0;
        try {
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
                    .andWhere('order.status != :cancelledOrderStatus', {
                    cancelledOrderStatus: order_entity_1.OrderStatus.CANCELLED,
                })
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
            total = Number(totalRaw?.count ?? 0);
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
            const selectFields = [
                'ot.id AS id',
                'test.id AS "testId"',
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
                'test.abbreviation AS "testAbbreviation"',
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
                'test.normalTextMale AS "normalTextMale"',
                'test.normalTextFemale AS "normalTextFemale"',
                'ot.status AS status',
                'ot.resultValue AS "resultValue"',
                'ot.resultText AS "resultText"',
                'ot.resultParameters AS "resultParameters"',
                'ot.cultureResult AS "cultureResult"',
                'ot.resultDocumentStorageKey AS "resultDocumentStorageKey"',
                'ot.resultDocumentFileName AS "resultDocumentFileName"',
                'ot.resultDocumentMimeType AS "resultDocumentMimeType"',
                'ot.resultDocumentSizeBytes AS "resultDocumentSizeBytes"',
                'ot.resultDocumentUploadedAt AS "resultDocumentUploadedAt"',
                'ot.resultDocumentUploadedBy AS "resultDocumentUploadedBy"',
                'ot.rejectionReason AS "rejectionReason"',
                'ot.flag AS flag',
                'ot.resultedAt AS "resultedAt"',
                'ot.resultedBy AS "resultedBy"',
                'ot.verifiedAt AS "verifiedAt"',
                'ot.verifiedBy AS "verifiedBy"',
                'ot.parentOrderTestId AS "parentOrderTestId"',
                'test.sortOrder AS "sortOrder"',
                'ot.panelSortOrder AS "panelSortOrder"',
            ];
            if (view === WorklistView.FULL) {
                selectFields.push('test.resultEntryType AS "resultEntryType"', 'test.resultTextOptions AS "resultTextOptions"', 'test.allowCustomResultText AS "allowCustomResultText"', 'test.allowPanelSaveWithChildDefaults AS "allowPanelSaveWithChildDefaults"', 'test.cultureConfig AS "cultureConfig"', 'test.parameterDefinitions AS "parameterDefinitions"');
            }
            const rawItems = await buildBaseQuery()
                .andWhere('order.id IN (:...orderIds)', { orderIds })
                .select(selectFields)
                .orderBy('CASE WHEN ot.status = :rejectedStatus THEN 0 ELSE 1 END', 'ASC')
                .addOrderBy('order.registeredAt', 'DESC')
                .addOrderBy('ot.panelSortOrder', 'ASC', 'NULLS LAST')
                .addOrderBy('test.sortOrder', 'ASC')
                .addOrderBy('test.code', 'ASC')
                .setParameter('rejectedStatus', order_test_entity_1.OrderTestStatus.REJECTED)
                .getRawMany();
            const items = rawItems.map((item) => {
                const patientAgeSnapshot = this.computePatientAgeSnapshot(item.patientDob, item.registeredAt);
                const patientAge = patientAgeSnapshot?.years ?? null;
                const patientAgeDisplay = (0, patient_age_util_1.formatPatientAgeDisplay)(item.patientDob ?? null, item.registeredAt ?? null);
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
                }, item.patientSex, patientAgeSnapshot);
                return {
                    id: item.id,
                    testId: item.testId,
                    orderNumber: item.orderNumber,
                    orderId: item.orderId,
                    sampleId: item.sampleId,
                    patientName: item.patientName,
                    patientSex: item.patientSex,
                    patientAge,
                    patientAgeDisplay,
                    testCode: item.testCode,
                    testName: item.testName,
                    testAbbreviation: item.testAbbreviation ?? null,
                    testType: item.testType,
                    testUnit: item.testUnit,
                    normalMin: resolvedRange.normalMin,
                    normalMax: resolvedRange.normalMax,
                    normalText: (0, normal_range_util_1.resolveNormalText)({
                        normalText: item.normalText ?? null,
                        normalTextMale: item.normalTextMale ?? null,
                        normalTextFemale: item.normalTextFemale ?? null,
                    }, item.patientSex),
                    resultEntryType: this.normalizeResultEntryType(item.resultEntryType),
                    resultTextOptions: parseJsonField(item.resultTextOptions) ??
                        null,
                    allowCustomResultText: Boolean(item.allowCustomResultText),
                    allowPanelSaveWithChildDefaults: Boolean(item.allowPanelSaveWithChildDefaults),
                    cultureConfig: this.normalizeCultureConfig(parseJsonField(item.cultureConfig)),
                    cultureAntibioticIds: [],
                    tubeType: item.tubeType,
                    status: item.status,
                    resultValue: item.resultValue !== null && item.resultValue !== undefined
                        ? parseFloat(item.resultValue)
                        : null,
                    resultText: item.resultText,
                    flag: (0, order_test_flag_util_1.normalizeOrderTestFlag)(item.flag),
                    cultureResult: this.normalizeCultureResultFromStorage(parseJsonField(item.cultureResult)),
                    resultedAt: item.resultedAt,
                    resultedBy: item.resultedBy ?? null,
                    verifiedAt: item.verifiedAt,
                    verifiedBy: item.verifiedBy ?? null,
                    registeredAt: item.registeredAt,
                    parentOrderTestId: item.parentOrderTestId ?? null,
                    departmentId: item.departmentId ?? null,
                    departmentCode: item.departmentCode ?? null,
                    departmentName: item.departmentName ?? null,
                    parameterDefinitions: parseJsonField(item.parameterDefinitions) ??
                        null,
                    resultParameters: parseJsonField(item.resultParameters) ?? null,
                    resultDocument: this.mapResultDocumentSummary(item),
                    rejectionReason: item.rejectionReason ?? null,
                    sortOrder: item.sortOrder != null ? Number(item.sortOrder) : 0,
                    panelSortOrder: item.panelSortOrder != null ? Number(item.panelSortOrder) : null,
                };
            });
            const itemsWithCultureTemplates = await this.attachCultureAntibioticIds(items);
            itemsCount = itemsWithCultureTemplates.length;
            return { items: itemsWithCultureTemplates, total };
        }
        finally {
            const durationMs = this.elapsedMs(startedAt);
            if (durationMs >= this.worklistPerfLogThresholdMs) {
                this.logger.warn(JSON.stringify({
                    event: 'worklist.get.performance',
                    labId,
                    view,
                    page,
                    size,
                    total,
                    itemsCount,
                    durationMs: Math.round(durationMs * 100) / 100,
                    filters: {
                        statuses: params.status ?? null,
                        hasSearch: Boolean(params.search?.trim()),
                        date: params.date ?? null,
                        departmentId: params.departmentId ?? null,
                    },
                }));
            }
        }
    }
    async getWorklistOrders(labId, params, userId) {
        const startedAt = process.hrtime.bigint();
        const page = Math.max(1, params.page ?? 1);
        const size = Math.min(100, Math.max(1, params.size ?? 25));
        const skip = (page - 1) * size;
        const mode = params.mode ?? WorklistOrderMode.ENTRY;
        let total = 0;
        let itemsCount = 0;
        try {
            const allowedDepartmentIds = await this.getAllowedDepartmentIdsForUser(userId, labId);
            let startDate = null;
            let endDate = null;
            if (params.date) {
                const labTimeZone = await this.getLabTimeZone(labId);
                const dateRange = this.getDateRangeOrThrow(params.date, labTimeZone, 'date');
                startDate = dateRange.startDate;
                endDate = dateRange.endDate;
            }
            const summaryQb = this.orderTestRepo
                .createQueryBuilder('ot')
                .innerJoin('ot.sample', 'sample')
                .innerJoin('sample.order', 'order')
                .innerJoin('order.patient', 'patient')
                .innerJoin('ot.test', 'test')
                .where('order.labId = :labId', { labId })
                .andWhere('ot."parentOrderTestId" IS NULL');
            if (allowedDepartmentIds && allowedDepartmentIds.length > 0) {
                summaryQb.andWhere('test.departmentId IN (:...allowedDepartmentIds)', {
                    allowedDepartmentIds,
                });
            }
            if (params.departmentId) {
                summaryQb.andWhere('test.departmentId = :departmentId', {
                    departmentId: params.departmentId,
                });
            }
            if (params.date) {
                summaryQb.andWhere('order.registeredAt BETWEEN :startDate AND :endDate', {
                    startDate,
                    endDate,
                });
            }
            if (params.search?.trim()) {
                const term = `%${params.search.trim()}%`;
                const exactSearch = params.search.trim();
                summaryQb.andWhere('(order.orderNumber ILIKE :term OR patient.fullName ILIKE :term OR patient.patientNumber = :exactSearch OR test.code ILIKE :term OR test.name ILIKE :term)', { term, exactSearch });
            }
            summaryQb
                .select('order.id', 'orderId')
                .addSelect('order.orderNumber', 'orderNumber')
                .addSelect('order.registeredAt', 'registeredAt')
                .addSelect('patient.fullName', 'patientName')
                .addSelect('patient.sex', 'patientSex')
                .addSelect('patient.dateOfBirth', 'patientDob')
                .addSelect('COUNT(ot.id)', 'progressTotalRoot')
                .addSelect(`SUM(CASE WHEN ot.status IN (:...pendingStatuses) THEN 1 ELSE 0 END)`, 'progressPending')
                .addSelect(`SUM(CASE WHEN ot.status = :completedStatus THEN 1 ELSE 0 END)`, 'progressCompleted')
                .addSelect(`SUM(CASE WHEN ot.status = :verifiedStatus THEN 1 ELSE 0 END)`, 'progressVerified')
                .addSelect(`SUM(CASE WHEN ot.status = :rejectedStatus THEN 1 ELSE 0 END)`, 'progressRejected')
                .addSelect(`MAX(CASE WHEN ot.status = :rejectedStatus AND NULLIF(TRIM(COALESCE(ot."rejectionReason", '')), '') IS NOT NULL THEN ot."rejectionReason" ELSE NULL END)`, 'firstRejectedReason')
                .addSelect(`SUM(CASE WHEN ot.status <> :verifiedStatus THEN 1 ELSE 0 END)`, 'notVerifiedCount')
                .groupBy('order.id')
                .addGroupBy('order.orderNumber')
                .addGroupBy('order.registeredAt')
                .addGroupBy('patient.fullName')
                .addGroupBy('patient.sex')
                .addGroupBy('patient.dateOfBirth')
                .setParameter('pendingStatuses', [
                order_test_entity_1.OrderTestStatus.PENDING,
                order_test_entity_1.OrderTestStatus.IN_PROGRESS,
            ])
                .setParameter('completedStatus', order_test_entity_1.OrderTestStatus.COMPLETED)
                .setParameter('verifiedStatus', order_test_entity_1.OrderTestStatus.VERIFIED)
                .setParameter('rejectedStatus', order_test_entity_1.OrderTestStatus.REJECTED);
            const pendingRootCountSql = `SUM(CASE WHEN ot.status IN (:...pendingStatuses) THEN 1 ELSE 0 END)`;
            const verifiedRootCountSql = `SUM(CASE WHEN ot.status = :verifiedStatus THEN 1 ELSE 0 END)`;
            const rejectedRootCountSql = `SUM(CASE WHEN ot.status = :rejectedStatus THEN 1 ELSE 0 END)`;
            const totalRootCountSql = 'COUNT(ot.id)';
            if (mode === WorklistOrderMode.VERIFY) {
                if (params.verificationStatus === WorklistVerificationStatus.UNVERIFIED) {
                    summaryQb
                        .having(`${pendingRootCountSql} = 0`)
                        .andHaving(`${verifiedRootCountSql} < ${totalRootCountSql}`);
                }
                else if (params.verificationStatus === WorklistVerificationStatus.VERIFIED) {
                    summaryQb
                        .having(`${totalRootCountSql} > 0`)
                        .andHaving(`${verifiedRootCountSql} = ${totalRootCountSql}`);
                }
                else {
                    summaryQb.having(`SUM(CASE WHEN ot.status = :completedStatus THEN 1 ELSE 0 END) > 0`);
                }
            }
            else {
                summaryQb.having(`SUM(CASE WHEN ot.status <> :verifiedStatus THEN 1 ELSE 0 END) > 0`);
                if (params.entryStatus === WorklistEntryStatus.PENDING) {
                    summaryQb.andHaving(`(${pendingRootCountSql} > 0 OR ${rejectedRootCountSql} > 0)`);
                }
                else if (params.entryStatus === WorklistEntryStatus.COMPLETED) {
                    summaryQb
                        .andHaving(`${pendingRootCountSql} = 0`)
                        .andHaving(`${rejectedRootCountSql} = 0`);
                }
            }
            summaryQb
                .orderBy(`SUM(CASE WHEN ot.status = :rejectedStatus THEN 1 ELSE 0 END)`, 'DESC')
                .addOrderBy('order.registeredAt', 'DESC');
            const totalRaw = await this.orderRepo.manager
                .createQueryBuilder()
                .select('COUNT(*)', 'count')
                .from(`(${summaryQb.getQuery()})`, 'summary')
                .setParameters(summaryQb.getParameters())
                .getRawOne();
            total = Number(totalRaw?.count ?? 0);
            const rows = await summaryQb
                .offset(skip)
                .limit(size)
                .getRawMany();
            const items = rows.map((row) => {
                const progressTotalRoot = Number.parseInt(row.progressTotalRoot, 10) || 0;
                const progressPending = Number.parseInt(row.progressPending, 10) || 0;
                const progressCompleted = Number.parseInt(row.progressCompleted, 10) || 0;
                const progressVerified = Number.parseInt(row.progressVerified, 10) || 0;
                const progressRejected = Number.parseInt(row.progressRejected, 10) || 0;
                const notVerifiedCount = Number.parseInt(row.notVerifiedCount, 10) || 0;
                return {
                    orderId: row.orderId,
                    orderNumber: row.orderNumber || row.orderId.substring(0, 8),
                    registeredAt: new Date(row.registeredAt),
                    patientName: row.patientName ?? '-',
                    patientSex: row.patientSex ?? null,
                    patientAge: this.computePatientAgeYears(row.patientDob, row.registeredAt),
                    patientAgeDisplay: (0, patient_age_util_1.formatPatientAgeDisplay)(row.patientDob, row.registeredAt),
                    progressTotalRoot,
                    progressPending,
                    progressCompleted,
                    progressVerified,
                    progressRejected,
                    firstRejectedReason: row.firstRejectedReason ?? null,
                    hasEnterable: notVerifiedCount > 0,
                    hasVerifiable: progressCompleted > 0,
                };
            });
            itemsCount = items.length;
            return {
                items,
                total,
                page,
                size,
                totalPages: Math.ceil(total / size),
            };
        }
        finally {
            const durationMs = this.elapsedMs(startedAt);
            if (durationMs >= this.worklistPerfLogThresholdMs) {
                this.logger.warn(JSON.stringify({
                    event: 'worklist.orders.performance',
                    labId,
                    mode,
                    page,
                    size,
                    total,
                    itemsCount,
                    durationMs: Math.round(durationMs * 100) / 100,
                    filters: {
                        hasSearch: Boolean(params.search?.trim()),
                        date: params.date ?? null,
                        departmentId: params.departmentId ?? null,
                        entryStatus: mode === WorklistOrderMode.ENTRY ? params.entryStatus ?? null : null,
                        verificationStatus: mode === WorklistOrderMode.VERIFY
                            ? params.verificationStatus ?? null
                            : null,
                    },
                }));
            }
        }
    }
    async getWorklistOrderTests(orderId, labId, params, userId) {
        const startedAt = process.hrtime.bigint();
        const mode = params.mode ?? WorklistOrderMode.ENTRY;
        try {
            const allowedDepartmentIds = await this.getAllowedDepartmentIdsForUser(userId, labId);
            const order = await this.orderRepo.findOne({
                where: { id: orderId, labId },
                relations: ['patient'],
            });
            if (!order) {
                throw new common_1.NotFoundException('Order not found');
            }
            const qb = this.orderTestRepo
                .createQueryBuilder('ot')
                .innerJoin('ot.sample', 'sample')
                .innerJoin('sample.order', 'order')
                .innerJoin('order.patient', 'patient')
                .innerJoin('ot.test', 'test')
                .leftJoin('test.department', 'department')
                .leftJoin('ot.parentOrderTest', 'parentOt')
                .where('order.id = :orderId', { orderId })
                .andWhere('order.labId = :labId', { labId });
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
            const rawItems = await qb
                .select([
                'ot.id AS id',
                'test.id AS "testId"',
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
                'test.abbreviation AS "testAbbreviation"',
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
                'test.normalTextMale AS "normalTextMale"',
                'test.normalTextFemale AS "normalTextFemale"',
                'test.resultEntryType AS "resultEntryType"',
                'test.resultTextOptions AS "resultTextOptions"',
                'test.allowCustomResultText AS "allowCustomResultText"',
                'test.allowPanelSaveWithChildDefaults AS "allowPanelSaveWithChildDefaults"',
                'test.cultureConfig AS "cultureConfig"',
                'test.parameterDefinitions AS "parameterDefinitions"',
                'ot.status AS status',
                'ot.resultValue AS "resultValue"',
                'ot.resultText AS "resultText"',
                'ot.resultParameters AS "resultParameters"',
                'ot.cultureResult AS "cultureResult"',
                'ot.resultDocumentStorageKey AS "resultDocumentStorageKey"',
                'ot.resultDocumentFileName AS "resultDocumentFileName"',
                'ot.resultDocumentMimeType AS "resultDocumentMimeType"',
                'ot.resultDocumentSizeBytes AS "resultDocumentSizeBytes"',
                'ot.resultDocumentUploadedAt AS "resultDocumentUploadedAt"',
                'ot.resultDocumentUploadedBy AS "resultDocumentUploadedBy"',
                'ot.rejectionReason AS "rejectionReason"',
                'ot.flag AS flag',
                'ot.resultedAt AS "resultedAt"',
                'ot.resultedBy AS "resultedBy"',
                'ot.verifiedAt AS "verifiedAt"',
                'ot.verifiedBy AS "verifiedBy"',
                'ot.parentOrderTestId AS "parentOrderTestId"',
                'test.sortOrder AS "sortOrder"',
                'ot.panelSortOrder AS "panelSortOrder"',
                'parentOt.panelSortOrder AS "parentPanelSortOrder"',
                'parentOt.id AS "parentId"',
            ])
                .orderBy(`CASE WHEN ot."parentOrderTestId" IS NULL AND test.type = :singleType THEN 0
                WHEN ot."parentOrderTestId" IS NULL AND test.type = :panelType THEN 1
                ELSE 2 END`, 'ASC')
                .addOrderBy('COALESCE(parentOt.panelSortOrder, ot.panelSortOrder)', 'ASC', 'NULLS LAST')
                .addOrderBy('ot.panelSortOrder', 'ASC', 'NULLS LAST')
                .addOrderBy('test.sortOrder', 'ASC')
                .addOrderBy('test.code', 'ASC')
                .setParameter('singleType', 'SINGLE')
                .setParameter('panelType', 'PANEL')
                .getRawMany();
            const mappedItems = rawItems.map((item) => this.mapRawWorklistItem(item));
            const items = await this.attachCultureAntibioticIds(mappedItems);
            const patientAge = this.computePatientAgeYears(order.patient?.dateOfBirth ?? null, order.registeredAt);
            const patientAgeDisplay = (0, patient_age_util_1.formatPatientAgeDisplay)(order.patient?.dateOfBirth ?? null, order.registeredAt);
            return {
                orderId: order.id,
                orderNumber: order.orderNumber ?? order.id.substring(0, 8),
                registeredAt: order.registeredAt,
                patientName: order.patient?.fullName ?? '-',
                patientSex: order.patient?.sex ?? null,
                patientAge,
                patientAgeDisplay,
                items,
            };
        }
        finally {
            const durationMs = this.elapsedMs(startedAt);
            if (durationMs >= this.worklistPerfLogThresholdMs) {
                this.logger.warn(JSON.stringify({
                    event: 'worklist.orderTests.performance',
                    labId,
                    orderId,
                    mode,
                    durationMs: Math.round(durationMs * 100) / 100,
                    filters: {
                        departmentId: params.departmentId ?? null,
                    },
                }));
            }
        }
    }
    async getWorklistItemDetail(orderTestId, labId, userId) {
        const startedAt = process.hrtime.bigint();
        try {
            let allowedDepartmentIds = null;
            if (userId) {
                const assignments = await this.userDeptRepo.find({
                    where: { userId },
                    relations: ['department'],
                });
                const forLab = assignments
                    .filter((a) => a.department?.labId === labId)
                    .map((a) => a.departmentId);
                if (forLab.length > 0) {
                    allowedDepartmentIds = forLab;
                }
            }
            const orderTest = await this.orderTestRepo.findOne({
                where: { id: orderTestId },
                relations: [
                    'sample',
                    'sample.order',
                    'sample.order.patient',
                    'test',
                    'test.department',
                ],
            });
            if (!orderTest || orderTest.sample.order.labId !== labId) {
                throw new common_1.NotFoundException('Order test not found');
            }
            if (allowedDepartmentIds &&
                allowedDepartmentIds.length > 0 &&
                orderTest.test.departmentId &&
                !allowedDepartmentIds.includes(orderTest.test.departmentId)) {
                throw new common_1.NotFoundException('Order test not found');
            }
            const patientAgeSnapshot = this.computePatientAgeSnapshot(orderTest.sample.order.patient?.dateOfBirth, orderTest.sample.order.registeredAt);
            const patientAge = patientAgeSnapshot?.years ?? null;
            const patientAgeDisplay = (0, patient_age_util_1.formatPatientAgeDisplay)(orderTest.sample.order.patient?.dateOfBirth ?? null, orderTest.sample.order.registeredAt);
            const resolvedRange = (0, normal_range_util_1.resolveNumericRange)({
                normalMin: orderTest.test.normalMin,
                normalMax: orderTest.test.normalMax,
                normalMinMale: orderTest.test.normalMinMale,
                normalMaxMale: orderTest.test.normalMaxMale,
                normalMinFemale: orderTest.test.normalMinFemale,
                normalMaxFemale: orderTest.test.normalMaxFemale,
                numericAgeRanges: orderTest.test.numericAgeRanges,
            }, orderTest.sample.order.patient?.sex ?? null, patientAgeSnapshot);
            const item = {
                id: orderTest.id,
                testId: orderTest.test.id,
                orderNumber: orderTest.sample.order.orderNumber ?? orderTest.sample.order.id.substring(0, 8),
                orderId: orderTest.sample.order.id,
                sampleId: orderTest.sample.id,
                patientName: orderTest.sample.order.patient?.fullName ?? '-',
                patientSex: orderTest.sample.order.patient?.sex ?? null,
                patientAge,
                patientAgeDisplay,
                testCode: orderTest.test.code,
                testName: orderTest.test.name,
                testAbbreviation: orderTest.test.abbreviation ?? null,
                testType: orderTest.test.type,
                testUnit: orderTest.test.unit,
                normalMin: resolvedRange.normalMin,
                normalMax: resolvedRange.normalMax,
                normalText: (0, normal_range_util_1.resolveNormalText)(orderTest.test, orderTest.sample.order.patient?.sex ?? null),
                resultEntryType: this.normalizeResultEntryType(orderTest.test.resultEntryType),
                resultTextOptions: this.normalizeResultTextOptions(orderTest.test.resultTextOptions),
                allowCustomResultText: Boolean(orderTest.test.allowCustomResultText),
                allowPanelSaveWithChildDefaults: Boolean(orderTest.test.allowPanelSaveWithChildDefaults),
                cultureConfig: this.normalizeCultureConfig(orderTest.test.cultureConfig),
                cultureAntibioticIds: [],
                tubeType: orderTest.sample.tubeType,
                status: orderTest.status,
                resultValue: orderTest.resultValue ?? null,
                resultText: orderTest.resultText ?? null,
                flag: (0, order_test_flag_util_1.normalizeOrderTestFlag)(orderTest.flag ?? null),
                cultureResult: this.normalizeCultureResultFromStorage(orderTest.cultureResult),
                resultedAt: orderTest.resultedAt ?? null,
                resultedBy: orderTest.resultedBy ?? null,
                verifiedAt: orderTest.verifiedAt ?? null,
                verifiedBy: orderTest.verifiedBy ?? null,
                registeredAt: orderTest.sample.order.registeredAt,
                parentOrderTestId: orderTest.parentOrderTestId ?? null,
                departmentId: orderTest.test.departmentId ?? null,
                departmentCode: orderTest.test.department?.code ?? null,
                departmentName: orderTest.test.department?.name ?? null,
                parameterDefinitions: orderTest.test.parameterDefinitions ?? null,
                resultParameters: orderTest.resultParameters ?? null,
                resultDocument: this.mapResultDocumentSummary(orderTest),
                rejectionReason: orderTest.rejectionReason ?? null,
                sortOrder: orderTest.test.sortOrder ?? 0,
                panelSortOrder: orderTest.panelSortOrder ?? null,
            };
            const [withCultureTemplates] = await this.attachCultureAntibioticIds([item]);
            return withCultureTemplates ?? item;
        }
        finally {
            const durationMs = this.elapsedMs(startedAt);
            if (durationMs >= this.worklistPerfLogThresholdMs) {
                this.logger.warn(JSON.stringify({
                    event: 'worklist.detail.performance',
                    labId,
                    orderTestId,
                    durationMs: Math.round(durationMs * 100) / 100,
                }));
            }
        }
    }
    async getCultureEntryHistory(labId) {
        const lab = await this.labRepo.findOne({
            where: { id: labId },
            select: ['id', 'cultureEntryHistory'],
        });
        if (!lab) {
            throw new common_1.NotFoundException('Lab not found');
        }
        return this.normalizeCultureEntryHistory(lab.cultureEntryHistory);
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
        if (orderTest.test.type === test_entity_1.TestType.PANEL && !orderTest.parentOrderTestId) {
            throw new common_1.BadRequestException('Panel roots cannot be entered directly. Enter results through the child tests.');
        }
        const resultEntryType = this.normalizeResultEntryType(orderTest.test.resultEntryType);
        if (resultEntryType === 'PDF_UPLOAD') {
            throw new common_1.BadRequestException('PDF_UPLOAD tests must be completed by uploading a result document');
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
        if (data.cultureResult !== undefined) {
            orderTest.cultureResult = await this.normalizeCultureResultInput(data.cultureResult, orderTest.test, labId);
        }
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
            orderTest.cultureResult = null;
            orderTest.flag = this.toResultFlag(matchedOption?.flag ?? null);
        }
        else if (resultEntryType === 'TEXT') {
            if (data.resultText !== undefined) {
                orderTest.resultText = normalizedResultTextInput ?? null;
            }
            orderTest.resultValue = null;
            orderTest.cultureResult = null;
            orderTest.flag = this.resolveFlagFromResultText(orderTest.resultText, resultTextOptions);
        }
        else if (resultEntryType === 'CULTURE_SENSITIVITY') {
            if (data.cultureResult !== undefined) {
                orderTest.cultureResult = await this.normalizeCultureResultInput(data.cultureResult, orderTest.test, labId);
            }
            orderTest.resultValue = null;
            orderTest.resultParameters = null;
            orderTest.flag = null;
            orderTest.resultText = this.summarizeCultureResult(orderTest.cultureResult);
        }
        else {
            if (data.resultText !== undefined) {
                orderTest.resultText = normalizedResultTextInput ?? null;
            }
            orderTest.cultureResult = null;
            const optionFlag = this.resolveFlagFromResultText(orderTest.resultText, resultTextOptions);
            if (optionFlag) {
                orderTest.flag = optionFlag;
            }
            else {
                const patientAgeSnapshot = this.computePatientAgeSnapshot(orderTest.sample.order.patient?.dateOfBirth ?? null, orderTest.sample.order.registeredAt);
                orderTest.flag = this.calculateFlag(orderTest.resultValue, orderTest.test, orderTest.sample.order.patient?.sex || null, patientAgeSnapshot);
            }
        }
        if (!(0, order_test_result_util_1.hasMeaningfulOrderTestResult)(orderTest)) {
            throw new common_1.BadRequestException('Cannot complete a test without a real result value, text, parameters, or culture data');
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
        if (resultEntryType === 'CULTURE_SENSITIVITY' &&
            orderTest.cultureResult) {
            await this.appendCultureEntryHistorySafe(labId, [orderTest.cultureResult]);
        }
        await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
        await this.syncOrderStatus(orderTest.sample.orderId);
        this.triggerReportStorageSync(orderTest.sample.orderId, labId, 'result entry');
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
                cultureResult: data.cultureResult,
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
        const updatedPanelRootIds = new Set();
        const auditLogs = [];
        const antibioticCacheById = new Map();
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
            if (orderTest.test.type === test_entity_1.TestType.PANEL && !orderTest.parentOrderTestId) {
                continue;
            }
            const resultEntryType = this.normalizeResultEntryType(orderTest.test.resultEntryType);
            if (resultEntryType === 'PDF_UPLOAD') {
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
            if (data.cultureResult !== undefined) {
                orderTest.cultureResult = await this.normalizeCultureResultInput(data.cultureResult, orderTest.test, labId, antibioticCacheById);
            }
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
                orderTest.cultureResult = null;
                orderTest.flag = this.toResultFlag(matchedOption?.flag ?? null);
            }
            else if (resultEntryType === 'TEXT') {
                if (data.resultText !== undefined) {
                    orderTest.resultText = normalizedResultTextInput ?? null;
                }
                orderTest.resultValue = null;
                orderTest.cultureResult = null;
                orderTest.flag = this.resolveFlagFromResultText(orderTest.resultText, resultTextOptions);
            }
            else if (resultEntryType === 'CULTURE_SENSITIVITY') {
                if (data.cultureResult !== undefined) {
                    orderTest.cultureResult = await this.normalizeCultureResultInput(data.cultureResult, orderTest.test, labId, antibioticCacheById);
                }
                orderTest.resultValue = null;
                orderTest.resultParameters = null;
                orderTest.flag = null;
                orderTest.resultText = this.summarizeCultureResult(orderTest.cultureResult);
            }
            else {
                if (data.resultText !== undefined) {
                    orderTest.resultText = normalizedResultTextInput ?? null;
                }
                orderTest.cultureResult = null;
                const optionFlag = this.resolveFlagFromResultText(orderTest.resultText, resultTextOptions);
                if (optionFlag) {
                    orderTest.flag = optionFlag;
                }
                else {
                    const patientAgeSnapshot = this.computePatientAgeSnapshot(orderTest.sample.order.patient?.dateOfBirth ?? null, orderTest.sample.order.registeredAt);
                    orderTest.flag = this.calculateFlag(orderTest.resultValue, orderTest.test, orderTest.sample.order.patient?.sex || null, patientAgeSnapshot);
                }
            }
            if (!(0, order_test_result_util_1.hasMeaningfulOrderTestResult)(orderTest)) {
                continue;
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
            if (orderTest.parentOrderTestId) {
                updatedPanelRootIds.add(orderTest.parentOrderTestId);
            }
            else if (orderTest.test.type === 'PANEL') {
                updatedPanelRootIds.add(orderTest.id);
            }
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
                    cultureResult: data.cultureResult,
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
            await this.appendCultureEntryHistorySafe(labId, toSave
                .filter((orderTest) => this.normalizeResultEntryType(orderTest.test.resultEntryType) ===
                'CULTURE_SENSITIVITY')
                .map((orderTest) => orderTest.cultureResult));
            for (const panelRootId of updatedPanelRootIds) {
                await this.panelStatusService.recomputePanelStatus(panelRootId);
            }
            for (const oid of updatedOrderIds) {
                await this.syncOrderStatus(oid);
                this.triggerReportStorageSync(oid, labId, 'batch result entry');
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
        if (orderTest.status === order_test_entity_1.OrderTestStatus.REJECTED) {
            throw new common_1.BadRequestException('Rejected results must be reviewed in Worklist before verification');
        }
        if (!(0, order_test_result_util_1.hasMeaningfulOrderTestResult)(orderTest)) {
            throw new common_1.BadRequestException('Cannot verify a test without a real result value, text, parameters, or culture data');
        }
        orderTest.status = order_test_entity_1.OrderTestStatus.VERIFIED;
        orderTest.verifiedAt = new Date();
        orderTest.verifiedBy = actor.userId;
        const saved = await this.orderTestRepo.save(orderTest);
        await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
        await this.syncOrderStatus(orderTest.sample.orderId);
        this.triggerReportStorageSync(orderTest.sample.orderId, labId, 'result verification');
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
                cultureResult: orderTest.cultureResult,
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
        const updatedPanelRootIds = new Set();
        const auditLogs = [];
        let failed = 0;
        for (const ot of orderTests) {
            if (ot.sample.order.labId !== labId ||
                ot.status === order_test_entity_1.OrderTestStatus.VERIFIED ||
                ot.status === order_test_entity_1.OrderTestStatus.REJECTED ||
                ot.status === order_test_entity_1.OrderTestStatus.PENDING ||
                !(0, order_test_result_util_1.hasMeaningfulOrderTestResult)(ot)) {
                failed++;
                continue;
            }
            ot.status = order_test_entity_1.OrderTestStatus.VERIFIED;
            ot.verifiedAt = new Date();
            ot.verifiedBy = actor.userId;
            toSave.push(ot);
            updatedOrderIds.add(ot.sample.orderId);
            if (ot.parentOrderTestId) {
                updatedPanelRootIds.add(ot.parentOrderTestId);
            }
            else if (ot.test.type === 'PANEL') {
                updatedPanelRootIds.add(ot.id);
            }
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
                    cultureResult: ot.cultureResult,
                    flag: ot.flag,
                    status: order_test_entity_1.OrderTestStatus.VERIFIED,
                    ...impersonationAudit,
                },
                description: `Verified result for test ${ot.test?.code || ot.id}`,
            });
        }
        if (toSave.length > 0) {
            await this.orderTestRepo.save(toSave);
            for (const panelRootId of updatedPanelRootIds) {
                await this.panelStatusService.recomputePanelStatus(panelRootId);
            }
            for (const oid of updatedOrderIds) {
                await this.syncOrderStatus(oid);
                this.triggerReportStorageSync(oid, labId, 'batch result verification');
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
        orderTest.verifiedAt = null;
        orderTest.verifiedBy = null;
        const saved = await this.orderTestRepo.save(orderTest);
        await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
        await this.syncOrderStatus(orderTest.sample.orderId);
        this.triggerReportStorageSync(orderTest.sample.orderId, labId, 'result rejection');
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
    async uploadResultDocument(orderTestId, labId, actor, actorRole, file, options) {
        if (!file?.buffer?.length) {
            throw new common_1.BadRequestException('A PDF file is required');
        }
        const orderTest = await this.orderTestRepo.findOne({
            where: { id: orderTestId },
            relations: ['sample', 'sample.order', 'sample.order.patient', 'test'],
        });
        if (!orderTest || orderTest.sample.order.labId !== labId) {
            throw new common_1.NotFoundException('Order test not found');
        }
        if (orderTest.test.type !== test_entity_1.TestType.SINGLE) {
            throw new common_1.BadRequestException('Result documents are only supported for single tests');
        }
        const resultEntryType = this.normalizeResultEntryType(orderTest.test.resultEntryType);
        if (resultEntryType !== 'PDF_UPLOAD') {
            throw new common_1.BadRequestException('This test is not configured for PDF_UPLOAD');
        }
        const forceEditVerified = options?.forceEditVerified === true;
        const canForceEditVerified = actor.isImpersonation ||
            actorRole === 'LAB_ADMIN' ||
            actorRole === 'SUPER_ADMIN';
        const isVerifiedOverride = orderTest.status === order_test_entity_1.OrderTestStatus.VERIFIED &&
            forceEditVerified &&
            canForceEditVerified;
        if (orderTest.status === order_test_entity_1.OrderTestStatus.VERIFIED && !isVerifiedOverride) {
            throw new common_1.BadRequestException('Cannot modify a verified result');
        }
        const hadExistingDocument = Boolean(orderTest.resultDocumentStorageKey?.trim());
        const stored = await this.resultDocumentsService.savePdf({
            labId,
            orderTestId: orderTest.id,
            buffer: file.buffer,
            originalName: file.originalname,
            mimeType: file.mimetype,
            previousStorageKey: orderTest.resultDocumentStorageKey,
        });
        orderTest.resultValue = null;
        orderTest.resultText = null;
        orderTest.resultParameters = null;
        orderTest.cultureResult = null;
        orderTest.flag = null;
        orderTest.resultDocumentStorageKey = stored.storageKey;
        orderTest.resultDocumentFileName = stored.fileName;
        orderTest.resultDocumentMimeType = stored.mimeType;
        orderTest.resultDocumentSizeBytes = stored.sizeBytes;
        orderTest.resultDocumentUploadedAt = new Date();
        orderTest.resultDocumentUploadedBy = actor.userId ?? null;
        orderTest.rejectionReason = null;
        orderTest.resultedAt = new Date();
        orderTest.resultedBy = actor.userId ?? orderTest.resultedBy;
        orderTest.status = isVerifiedOverride
            ? order_test_entity_1.OrderTestStatus.VERIFIED
            : order_test_entity_1.OrderTestStatus.COMPLETED;
        if (isVerifiedOverride) {
            orderTest.verifiedAt = new Date();
            orderTest.verifiedBy = actor.userId ?? orderTest.verifiedBy;
        }
        else {
            orderTest.verifiedAt = null;
            orderTest.verifiedBy = null;
        }
        const saved = await this.orderTestRepo.save(orderTest);
        await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
        await this.syncOrderStatus(orderTest.sample.orderId);
        this.triggerReportStorageSync(orderTest.sample.orderId, labId, 'PDF result upload');
        await this.auditService.log({
            actorType: actor.actorType,
            actorId: actor.actorId,
            labId,
            userId: actor.userId,
            action: hadExistingDocument
                ? audit_log_entity_1.AuditAction.RESULT_UPDATE
                : audit_log_entity_1.AuditAction.RESULT_ENTER,
            entityType: 'order_test',
            entityId: orderTestId,
            newValues: {
                resultDocument: {
                    fileName: stored.fileName,
                    mimeType: stored.mimeType,
                    sizeBytes: stored.sizeBytes,
                },
                forceEditVerified: isVerifiedOverride,
            },
            description: `Uploaded PDF result for test ${orderTest.test?.code || orderTestId}`,
        });
        return saved;
    }
    async removeResultDocument(orderTestId, labId, actor, actorRole, options) {
        const orderTest = await this.orderTestRepo.findOne({
            where: { id: orderTestId },
            relations: ['sample', 'sample.order', 'test'],
        });
        if (!orderTest || orderTest.sample.order.labId !== labId) {
            throw new common_1.NotFoundException('Order test not found');
        }
        const resultEntryType = this.normalizeResultEntryType(orderTest.test.resultEntryType);
        if (resultEntryType !== 'PDF_UPLOAD') {
            throw new common_1.BadRequestException('This test is not configured for PDF_UPLOAD');
        }
        const forceEditVerified = options?.forceEditVerified === true;
        const canForceEditVerified = actor.isImpersonation ||
            actorRole === 'LAB_ADMIN' ||
            actorRole === 'SUPER_ADMIN';
        const isVerifiedOverride = orderTest.status === order_test_entity_1.OrderTestStatus.VERIFIED &&
            forceEditVerified &&
            canForceEditVerified;
        if (orderTest.status === order_test_entity_1.OrderTestStatus.VERIFIED && !isVerifiedOverride) {
            throw new common_1.BadRequestException('Cannot modify a verified result');
        }
        await this.resultDocumentsService.deleteDocument(orderTest.resultDocumentStorageKey);
        orderTest.resultDocumentStorageKey = null;
        orderTest.resultDocumentFileName = null;
        orderTest.resultDocumentMimeType = null;
        orderTest.resultDocumentSizeBytes = null;
        orderTest.resultDocumentUploadedAt = null;
        orderTest.resultDocumentUploadedBy = null;
        orderTest.resultedAt = null;
        orderTest.resultedBy = null;
        orderTest.verifiedAt = null;
        orderTest.verifiedBy = null;
        orderTest.status = order_test_entity_1.OrderTestStatus.PENDING;
        const saved = await this.orderTestRepo.save(orderTest);
        await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
        await this.syncOrderStatus(orderTest.sample.orderId);
        this.triggerReportStorageSync(orderTest.sample.orderId, labId, 'PDF result removal');
        await this.auditService.log({
            actorType: actor.actorType,
            actorId: actor.actorId,
            labId,
            userId: actor.userId,
            action: audit_log_entity_1.AuditAction.RESULT_UPDATE,
            entityType: 'order_test',
            entityId: orderTestId,
            newValues: {
                resultDocument: null,
            },
            description: `Removed PDF result for test ${orderTest.test?.code || orderTestId}`,
        });
        return saved;
    }
    async getResultDocumentForLab(orderTestId, labId) {
        const orderTest = await this.orderTestRepo.findOne({
            where: { id: orderTestId },
            relations: ['sample', 'sample.order'],
        });
        if (!orderTest || orderTest.sample.order.labId !== labId) {
            throw new common_1.NotFoundException('Order test not found');
        }
        const buffer = await this.resultDocumentsService.readDocument(orderTest.resultDocumentStorageKey);
        return {
            buffer,
            fileName: orderTest.resultDocumentFileName ?? 'result.pdf',
            mimeType: orderTest.resultDocumentMimeType ?? 'application/pdf',
        };
    }
    async getAllowedDepartmentIdsForUser(userId, labId) {
        if (!userId) {
            return null;
        }
        const assignments = await this.userDeptRepo.find({
            where: { userId },
            relations: ['department'],
        });
        const forLab = assignments
            .filter((assignment) => assignment.department?.labId === labId)
            .map((assignment) => assignment.departmentId);
        return forLab.length > 0 ? forLab : null;
    }
    mapRawWorklistItem(item) {
        const patientAgeSnapshot = this.computePatientAgeSnapshot(item.patientDob ?? null, item.registeredAt ?? null);
        const patientAge = patientAgeSnapshot?.years ?? null;
        const patientAgeDisplay = (0, patient_age_util_1.formatPatientAgeDisplay)(item.patientDob ?? null, item.registeredAt ?? null);
        const numericAgeRanges = parseJsonField(item.numericAgeRanges) ?? null;
        const resolvedRange = (0, normal_range_util_1.resolveNumericRange)({
            normalMin: item.normalMin,
            normalMax: item.normalMax,
            normalMinMale: item.normalMinMale,
            normalMaxMale: item.normalMaxMale,
            normalMinFemale: item.normalMinFemale,
            normalMaxFemale: item.normalMaxFemale,
            numericAgeRanges,
        }, item.patientSex ?? null, patientAgeSnapshot);
        const rawResultValue = item.resultValue;
        return {
            id: String(item.id),
            testId: String(item.testId ?? ''),
            orderNumber: String(item.orderNumber ?? ''),
            orderId: String(item.orderId),
            sampleId: String(item.sampleId),
            patientName: String(item.patientName ?? '-'),
            patientSex: item.patientSex ?? null,
            patientAge,
            patientAgeDisplay,
            testCode: String(item.testCode ?? ''),
            testName: String(item.testName ?? ''),
            testAbbreviation: item.testAbbreviation ?? null,
            testType: item.testType ?? 'SINGLE',
            testUnit: item.testUnit ?? null,
            normalMin: resolvedRange.normalMin,
            normalMax: resolvedRange.normalMax,
            normalText: (0, normal_range_util_1.resolveNormalText)({
                normalText: item.normalText ?? null,
                normalTextMale: item.normalTextMale ?? null,
                normalTextFemale: item.normalTextFemale ?? null,
            }, item.patientSex ?? null),
            resultEntryType: this.normalizeResultEntryType(item.resultEntryType),
            resultTextOptions: this.normalizeResultTextOptions(parseJsonField(item.resultTextOptions) ?? null),
            allowCustomResultText: Boolean(item.allowCustomResultText),
            allowPanelSaveWithChildDefaults: Boolean(item.allowPanelSaveWithChildDefaults),
            cultureConfig: this.normalizeCultureConfig(parseJsonField(item.cultureConfig)),
            cultureAntibioticIds: [],
            tubeType: item.tubeType ?? null,
            status: item.status,
            resultValue: rawResultValue !== null && rawResultValue !== undefined
                ? parseFloat(String(rawResultValue))
                : null,
            resultText: item.resultText ?? null,
            flag: (0, order_test_flag_util_1.normalizeOrderTestFlag)(item.flag),
            cultureResult: this.normalizeCultureResultFromStorage(parseJsonField(item.cultureResult)),
            resultedAt: item.resultedAt ?? null,
            resultedBy: item.resultedBy ?? null,
            verifiedAt: item.verifiedAt ?? null,
            verifiedBy: item.verifiedBy ?? null,
            registeredAt: item.registeredAt,
            parentOrderTestId: item.parentOrderTestId ?? null,
            departmentId: item.departmentId ?? null,
            departmentCode: item.departmentCode ?? null,
            departmentName: item.departmentName ?? null,
            parameterDefinitions: parseJsonField(item.parameterDefinitions) ?? null,
            resultParameters: parseJsonField(item.resultParameters) ?? null,
            resultDocument: this.mapResultDocumentSummary(item),
            rejectionReason: item.rejectionReason ?? null,
            sortOrder: item.sortOrder != null
                ? Number(item.sortOrder)
                : 0,
            panelSortOrder: item.panelSortOrder != null
                ? Number(item.panelSortOrder)
                : null,
        };
    }
    normalizeResultEntryType(value) {
        const normalized = String(value || 'NUMERIC').trim().toUpperCase();
        if (normalized === 'NUMERIC' ||
            normalized === 'QUALITATIVE' ||
            normalized === 'TEXT' ||
            normalized === 'CULTURE_SENSITIVITY' ||
            normalized === 'PDF_UPLOAD') {
            return normalized;
        }
        return 'NUMERIC';
    }
    mapResultDocumentSummary(item) {
        const storageKey = String(item.resultDocumentStorageKey ?? '').trim();
        const fileName = String(item.resultDocumentFileName ?? '').trim();
        if (!storageKey || !fileName) {
            return null;
        }
        const rawSize = Number(item.resultDocumentSizeBytes ?? 0);
        return {
            fileName,
            mimeType: String(item.resultDocumentMimeType ?? 'application/pdf').trim() || 'application/pdf',
            sizeBytes: Number.isFinite(rawSize) && rawSize > 0 ? Math.round(rawSize) : 0,
            uploadedAt: item.resultDocumentUploadedAt instanceof Date
                ? item.resultDocumentUploadedAt.toISOString()
                : typeof item.resultDocumentUploadedAt === 'string'
                    ? item.resultDocumentUploadedAt
                    : null,
            uploadedBy: item.resultDocumentUploadedBy ?? null,
        };
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
            flag: this.toResultTextOptionFlag(option?.flag ?? null),
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
    normalizeCultureConfig(config) {
        if (!config || typeof config !== 'object')
            return null;
        const seen = new Set();
        const interpretationOptions = (config.interpretationOptions ?? [])
            .map((value) => String(value ?? '').trim().toUpperCase())
            .filter((value) => {
            if (!value || seen.has(value))
                return false;
            seen.add(value);
            return true;
        });
        const micUnit = typeof config.micUnit === 'string' && config.micUnit.trim().length > 0
            ? config.micUnit.trim()
            : null;
        return {
            interpretationOptions: interpretationOptions.length
                ? interpretationOptions
                : ['S', 'I', 'R'],
            micUnit,
        };
    }
    normalizeCultureResultFromStorage(payload) {
        if (!payload || typeof payload !== 'object')
            return null;
        const noGrowth = payload.noGrowth === true;
        const noGrowthResult = typeof payload.noGrowthResult === 'string' &&
            payload.noGrowthResult.trim().length > 0
            ? payload.noGrowthResult.trim()
            : null;
        const notes = typeof payload.notes === 'string' && payload.notes.trim().length > 0
            ? payload.notes.trim()
            : null;
        const isolates = Array.isArray(payload.isolates)
            ? payload.isolates
                .map((isolate, isolateIndex) => {
                const isolateKeyRaw = String(isolate?.isolateKey ?? `isolate-${isolateIndex + 1}`).trim();
                const organism = String(isolate?.organism ?? '').trim();
                const source = typeof isolate?.source === 'string' && isolate.source.trim().length > 0
                    ? isolate.source.trim()
                    : null;
                const condition = typeof isolate?.condition === 'string' &&
                    isolate.condition.trim().length > 0
                    ? isolate.condition.trim()
                    : null;
                const colonyCount = typeof isolate?.colonyCount === 'string' &&
                    isolate.colonyCount.trim().length > 0
                    ? isolate.colonyCount.trim()
                    : null;
                const comment = typeof isolate?.comment === 'string' && isolate.comment.trim().length > 0
                    ? isolate.comment.trim()
                    : null;
                const antibiotics = Array.isArray(isolate?.antibiotics)
                    ? isolate.antibiotics
                        .map((row) => {
                        const interpretation = String(row?.interpretation ?? '')
                            .trim()
                            .toUpperCase();
                        if (!interpretation)
                            return null;
                        const mic = typeof row?.mic === 'string' && row.mic.trim().length > 0
                            ? row.mic.trim()
                            : null;
                        const antibioticId = typeof row?.antibioticId === 'string' &&
                            row.antibioticId.trim().length > 0
                            ? row.antibioticId.trim()
                            : null;
                        const antibioticCode = typeof row?.antibioticCode === 'string' &&
                            row.antibioticCode.trim().length > 0
                            ? row.antibioticCode.trim().toUpperCase()
                            : null;
                        const antibioticName = typeof row?.antibioticName === 'string' &&
                            row.antibioticName.trim().length > 0
                            ? row.antibioticName.trim()
                            : null;
                        return {
                            antibioticId,
                            antibioticCode,
                            antibioticName,
                            interpretation,
                            mic,
                        };
                    })
                        .filter((row) => Boolean(row))
                    : [];
                if (!organism && !source && !condition && !colonyCount && antibiotics.length === 0) {
                    return null;
                }
                return {
                    isolateKey: isolateKeyRaw || `isolate-${isolateIndex + 1}`,
                    organism,
                    source,
                    condition,
                    colonyCount,
                    comment,
                    antibiotics,
                };
            })
                .filter((isolate) => Boolean(isolate))
            : [];
        return {
            noGrowth,
            noGrowthResult,
            notes,
            isolates,
        };
    }
    summarizeCultureResult(payload) {
        const normalized = this.normalizeCultureResultFromStorage(payload);
        if (!normalized)
            return null;
        if (normalized.noGrowth) {
            return normalized.noGrowthResult || 'No growth';
        }
        const isolateCount = normalized.isolates.length;
        const antibioticCount = normalized.isolates.reduce((sum, isolate) => sum + isolate.antibiotics.length, 0);
        if (isolateCount === 0 && normalized.notes) {
            return normalized.notes;
        }
        return `${isolateCount} isolate${isolateCount === 1 ? '' : 's'} • ${antibioticCount} antibiotic row${antibioticCount === 1 ? '' : 's'}`;
    }
    async normalizeCultureResultInput(payload, test, labId, antibioticCacheById) {
        if (payload === null)
            return null;
        if (!payload || typeof payload !== 'object') {
            throw new common_1.BadRequestException('Invalid cultureResult payload');
        }
        if (this.normalizeResultEntryType(test.resultEntryType) !== 'CULTURE_SENSITIVITY') {
            throw new common_1.BadRequestException('cultureResult can only be entered for CULTURE_SENSITIVITY tests');
        }
        const normalizedConfig = this.normalizeCultureConfig(test.cultureConfig);
        const interpretationOptions = new Set((normalizedConfig?.interpretationOptions ?? ['S', 'I', 'R']).map((value) => value.toUpperCase()));
        const noGrowth = payload.noGrowth === true;
        const noGrowthResult = typeof payload.noGrowthResult === 'string' &&
            payload.noGrowthResult.trim().length > 0
            ? payload.noGrowthResult.trim()
            : null;
        const notes = typeof payload.notes === 'string' && payload.notes.trim().length > 0
            ? payload.notes.trim()
            : null;
        const isolatesInput = Array.isArray(payload.isolates) ? payload.isolates : [];
        const cache = antibioticCacheById ?? new Map();
        const antibioticIds = Array.from(new Set(isolatesInput.flatMap((isolate) => Array.isArray(isolate?.antibiotics)
            ? isolate.antibiotics
                .map((row) => String(row?.antibioticId ?? '').trim())
                .filter((id) => id.length > 0)
            : [])));
        const missingIds = antibioticIds.filter((id) => !cache.has(id));
        if (missingIds.length > 0) {
            const fetched = await this.antibioticRepo.find({
                where: { labId, id: (0, typeorm_2.In)(missingIds) },
                select: ['id', 'code', 'name', 'isActive'],
            });
            for (const antibiotic of fetched) {
                cache.set(antibiotic.id, antibiotic);
            }
        }
        const isolates = isolatesInput
            .map((isolate, isolateIndex) => {
            const isolateKey = String(isolate?.isolateKey ?? `isolate-${isolateIndex + 1}`).trim();
            const organism = String(isolate?.organism ?? '').trim();
            const source = typeof isolate?.source === 'string' && isolate.source.trim().length > 0
                ? isolate.source.trim()
                : null;
            const condition = typeof isolate?.condition === 'string' &&
                isolate.condition.trim().length > 0
                ? isolate.condition.trim()
                : null;
            const colonyCount = typeof isolate?.colonyCount === 'string' &&
                isolate.colonyCount.trim().length > 0
                ? isolate.colonyCount.trim()
                : null;
            const comment = typeof isolate?.comment === 'string' && isolate.comment.trim().length > 0
                ? isolate.comment.trim()
                : null;
            const rows = Array.isArray(isolate?.antibiotics) ? isolate.antibiotics : [];
            const antibiotics = rows
                .map((row) => {
                const interpretation = String(row?.interpretation ?? '')
                    .trim()
                    .toUpperCase();
                if (!interpretation)
                    return null;
                if (!interpretationOptions.has(interpretation)) {
                    throw new common_1.BadRequestException(`Invalid interpretation "${interpretation}". Allowed values: ${Array.from(interpretationOptions).join(', ')}`);
                }
                const mic = typeof row?.mic === 'string' && row.mic.trim().length > 0
                    ? row.mic.trim()
                    : null;
                const rowAntibioticId = String(row?.antibioticId ?? '').trim();
                if (!rowAntibioticId) {
                    const antibioticCode = typeof row?.antibioticCode === 'string' &&
                        row.antibioticCode.trim().length > 0
                        ? row.antibioticCode.trim().toUpperCase()
                        : null;
                    const antibioticName = typeof row?.antibioticName === 'string' &&
                        row.antibioticName.trim().length > 0
                        ? row.antibioticName.trim()
                        : null;
                    if (!antibioticCode && !antibioticName) {
                        throw new common_1.BadRequestException('Each culture antibiotic row must include antibioticId or antibioticCode/name');
                    }
                    return {
                        antibioticId: null,
                        antibioticCode,
                        antibioticName,
                        interpretation,
                        mic,
                    };
                }
                const antibiotic = cache.get(rowAntibioticId);
                if (!antibiotic) {
                    throw new common_1.BadRequestException(`Antibiotic "${rowAntibioticId}" was not found in this lab`);
                }
                return {
                    antibioticId: antibiotic.id,
                    antibioticCode: antibiotic.code,
                    antibioticName: antibiotic.name,
                    interpretation,
                    mic,
                };
            })
                .filter((row) => Boolean(row));
            if (!noGrowth && !organism) {
                throw new common_1.BadRequestException('Each culture isolate requires an organism name');
            }
            if (!noGrowth && antibiotics.length === 0) {
                throw new common_1.BadRequestException('Each culture isolate requires at least one antibiotic row with interpretation');
            }
            return {
                isolateKey: isolateKey || `isolate-${isolateIndex + 1}`,
                organism,
                source,
                condition,
                colonyCount,
                comment,
                antibiotics,
            };
        })
            .filter((isolate) => Boolean(isolate));
        if (!noGrowth && isolates.length === 0) {
            throw new common_1.BadRequestException('cultureResult requires at least one isolate when noGrowth=false');
        }
        return {
            noGrowth,
            noGrowthResult,
            notes,
            isolates,
        };
    }
    async appendCultureEntryHistorySafe(labId, cultureResults) {
        try {
            await this.appendCultureEntryHistory(labId, cultureResults);
        }
        catch (error) {
            this.logger.warn(`Failed to persist culture entry history for lab ${labId}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async appendCultureEntryHistory(labId, cultureResults) {
        const additions = this.collectCultureEntryHistory(cultureResults);
        if (additions.microorganisms.length === 0 &&
            additions.conditions.length === 0 &&
            additions.colonyCounts.length === 0) {
            return;
        }
        const lab = await this.labRepo.findOne({
            where: { id: labId },
            select: ['id', 'cultureEntryHistory'],
        });
        if (!lab) {
            return;
        }
        const current = this.normalizeCultureEntryHistory(lab.cultureEntryHistory);
        const next = {
            microorganisms: this.prependUniqueHistoryValues(additions.microorganisms, current.microorganisms),
            conditions: this.prependUniqueHistoryValues(additions.conditions, current.conditions),
            colonyCounts: this.prependUniqueHistoryValues(additions.colonyCounts, current.colonyCounts),
        };
        if (this.areHistoryArraysEqual(next.microorganisms, current.microorganisms) &&
            this.areHistoryArraysEqual(next.conditions, current.conditions) &&
            this.areHistoryArraysEqual(next.colonyCounts, current.colonyCounts)) {
            return;
        }
        await this.labRepo.update({ id: labId }, { cultureEntryHistory: next });
    }
    collectCultureEntryHistory(cultureResults) {
        const microorganisms = [];
        const conditions = [];
        const colonyCounts = [];
        for (const result of cultureResults) {
            if (!result || typeof result !== 'object')
                continue;
            const isolates = Array.isArray(result.isolates) ? result.isolates : [];
            for (const isolate of isolates) {
                const organism = typeof isolate?.organism === 'string' ? isolate.organism.trim() : '';
                const condition = typeof isolate?.condition === 'string' ? isolate.condition.trim() : '';
                const colonyCount = typeof isolate?.colonyCount === 'string'
                    ? isolate.colonyCount.trim()
                    : '';
                if (organism && organism !== '-') {
                    microorganisms.push(organism);
                }
                if (condition) {
                    conditions.push(condition);
                }
                if (colonyCount) {
                    colonyCounts.push(colonyCount);
                }
            }
        }
        return {
            microorganisms: this.normalizeHistoryList(microorganisms),
            conditions: this.normalizeHistoryList(conditions),
            colonyCounts: this.normalizeHistoryList(colonyCounts),
        };
    }
    normalizeCultureEntryHistory(value) {
        const source = value && typeof value === 'object' ? value : {};
        return {
            microorganisms: this.normalizeHistoryList(source.microorganisms),
            conditions: this.normalizeHistoryList(source.conditions),
            colonyCounts: this.normalizeHistoryList(source.colonyCounts),
        };
    }
    normalizeHistoryList(value) {
        if (!Array.isArray(value))
            return [];
        const normalized = [];
        const seen = new Set();
        for (const raw of value) {
            if (typeof raw !== 'string')
                continue;
            const trimmed = raw.trim();
            if (!trimmed)
                continue;
            if (trimmed.length > WorklistService_1.CULTURE_HISTORY_MAX_VALUE_LENGTH) {
                continue;
            }
            const key = trimmed.toLocaleLowerCase();
            if (seen.has(key))
                continue;
            seen.add(key);
            normalized.push(trimmed);
            if (normalized.length >= WorklistService_1.CULTURE_HISTORY_MAX_ITEMS)
                break;
        }
        return normalized;
    }
    prependUniqueHistoryValues(additions, existing) {
        return this.normalizeHistoryList([
            ...additions,
            ...existing,
        ]).slice(0, WorklistService_1.CULTURE_HISTORY_MAX_ITEMS);
    }
    areHistoryArraysEqual(left, right) {
        if (left.length !== right.length)
            return false;
        for (let index = 0; index < left.length; index += 1) {
            if (left[index] !== right[index])
                return false;
        }
        return true;
    }
    async attachCultureAntibioticIds(items) {
        if (!items.length)
            return items;
        const testIds = Array.from(new Set(items
            .map((item) => item.testId)
            .filter((id) => typeof id === 'string' && id.length > 0)));
        if (testIds.length === 0)
            return items;
        const mappings = await this.testAntibioticRepo.find({
            where: { testId: (0, typeorm_2.In)(testIds) },
            order: { sortOrder: 'ASC', createdAt: 'ASC' },
            select: ['testId', 'antibioticId'],
        });
        const grouped = new Map();
        for (const mapping of mappings) {
            const current = grouped.get(mapping.testId) ?? [];
            current.push(mapping.antibioticId);
            grouped.set(mapping.testId, current);
        }
        return items.map((item) => ({
            ...item,
            cultureAntibioticIds: grouped.get(item.testId) ?? [],
        }));
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
        return (0, order_test_flag_util_1.normalizeOrderTestFlag)(flag);
    }
    toResultTextOptionFlag(flag) {
        const normalized = (0, order_test_flag_util_1.normalizeOrderTestFlag)(flag);
        if (normalized === order_test_entity_1.ResultFlag.NORMAL)
            return 'N';
        if (normalized === order_test_entity_1.ResultFlag.HIGH)
            return 'H';
        if (normalized === order_test_entity_1.ResultFlag.LOW)
            return 'L';
        if (normalized === order_test_entity_1.ResultFlag.POSITIVE)
            return 'POS';
        if (normalized === order_test_entity_1.ResultFlag.NEGATIVE)
            return 'NEG';
        if (normalized === order_test_entity_1.ResultFlag.ABNORMAL)
            return 'ABN';
        return null;
    }
    calculateFlag(resultValue, test, patientSex, patientAgeSnapshot) {
        if (resultValue === null)
            return null;
        const { normalMin, normalMax } = (0, normal_range_util_1.resolveNumericRange)(test, patientSex, patientAgeSnapshot);
        if (normalMin === null && normalMax === null) {
            return null;
        }
        if (normalMax !== null && resultValue > parseFloat(normalMax.toString())) {
            return order_test_entity_1.ResultFlag.HIGH;
        }
        if (normalMin !== null && resultValue < parseFloat(normalMin.toString())) {
            return order_test_entity_1.ResultFlag.LOW;
        }
        return order_test_entity_1.ResultFlag.NORMAL;
    }
    computePatientAgeYears(dateOfBirth, referenceDate = new Date()) {
        return (0, patient_age_util_1.getPatientAgeYears)(dateOfBirth, referenceDate);
    }
    computePatientAgeSnapshot(dateOfBirth, referenceDate = new Date()) {
        return (0, patient_age_util_1.getPatientAgeSnapshot)(dateOfBirth, referenceDate);
    }
    resolveWorklistPerfLogThresholdMs() {
        const parsed = Number.parseInt(process.env.WORKLIST_PERF_LOG_THRESHOLD_MS ?? '500', 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 500;
    }
    elapsedMs(startedAt) {
        return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
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
        if (!order || order.status === order_entity_1.OrderStatus.CANCELLED) {
            return;
        }
        const tests = await this.orderTestRepo
            .createQueryBuilder('ot')
            .innerJoinAndSelect('ot.test', 'test')
            .innerJoin('ot.sample', 'sample')
            .where('sample.orderId = :orderId', { orderId })
            .getMany();
        if (tests.length === 0) {
            return;
        }
        const rootTests = tests.filter((test) => !test.parentOrderTestId);
        const statuses = rootTests.length > 0 ? rootTests.map((test) => test.status) : tests.map((test) => test.status);
        const allVerified = statuses.length > 0 &&
            statuses.every((status) => status === order_test_entity_1.OrderTestStatus.VERIFIED);
        const nextStatus = allVerified ? order_entity_1.OrderStatus.COMPLETED : order_entity_1.OrderStatus.REGISTERED;
        if (order.status !== nextStatus) {
            order.status = nextStatus;
            await this.orderRepo.save(order);
        }
    }
};
exports.WorklistService = WorklistService;
WorklistService.CULTURE_HISTORY_MAX_ITEMS = 200;
WorklistService.CULTURE_HISTORY_MAX_VALUE_LENGTH = 120;
exports.WorklistService = WorklistService = WorklistService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(order_test_entity_1.OrderTest)),
    __param(1, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(2, (0, typeorm_1.InjectRepository)(test_entity_1.Test)),
    __param(3, (0, typeorm_1.InjectRepository)(test_antibiotic_entity_1.TestAntibiotic)),
    __param(4, (0, typeorm_1.InjectRepository)(antibiotic_entity_1.Antibiotic)),
    __param(5, (0, typeorm_1.InjectRepository)(lab_entity_1.Lab)),
    __param(6, (0, typeorm_1.InjectRepository)(user_department_assignment_entity_1.UserDepartmentAssignment)),
    __param(7, (0, typeorm_1.InjectRepository)(department_entity_1.Department)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        panel_status_service_1.PanelStatusService,
        audit_service_1.AuditService,
        result_documents_service_1.ResultDocumentsService,
        reports_service_1.ReportsService])
], WorklistService);
//# sourceMappingURL=worklist.service.js.map