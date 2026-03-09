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
var OrdersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const order_entity_1 = require("../entities/order.entity");
const sample_entity_1 = require("../entities/sample.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const patient_entity_1 = require("../entities/patient.entity");
const lab_entity_1 = require("../entities/lab.entity");
const shift_entity_1 = require("../entities/shift.entity");
const test_entity_1 = require("../entities/test.entity");
const pricing_entity_1 = require("../entities/pricing.entity");
const test_component_entity_1 = require("../entities/test-component.entity");
const lab_orders_worklist_entity_1 = require("../entities/lab-orders-worklist.entity");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const create_order_response_dto_1 = require("./dto/create-order-response.dto");
const audit_service_1 = require("../audit/audit.service");
const lab_counter_util_1 = require("../database/lab-counter.util");
const lab_timezone_util_1 = require("../database/lab-timezone.util");
const order_test_flag_util_1 = require("../order-tests/order-test-flag.util");
let OrdersService = OrdersService_1 = class OrdersService {
    constructor(orderRepo, patientRepo, labRepo, shiftRepo, testRepo, pricingRepo, testComponentRepo, worklistRepo, auditService) {
        this.orderRepo = orderRepo;
        this.patientRepo = patientRepo;
        this.labRepo = labRepo;
        this.shiftRepo = shiftRepo;
        this.testRepo = testRepo;
        this.pricingRepo = pricingRepo;
        this.testComponentRepo = testComponentRepo;
        this.worklistRepo = worklistRepo;
        this.auditService = auditService;
        this.logger = new common_1.Logger(OrdersService_1.name);
        this.createPerfLogThresholdMs = this.resolveCreatePerfLogThresholdMs();
        this.orderHistoryPerfLogThresholdMs = this.resolveOrderHistoryPerfLogThresholdMs();
        this.orderTestInsertChunkSize = this.resolveOrderTestInsertChunkSize();
    }
    async create(labId, dto, view = create_order_response_dto_1.CreateOrderView.SUMMARY) {
        const totalStartedAt = process.hrtime.bigint();
        const requestedTestsCount = dto.samples.reduce((sum, sample) => sum + (sample.tests?.length ?? 0), 0);
        const testIds = dto.samples.flatMap((s) => (s.tests ?? []).map((t) => t.testId));
        const uniqueTestIds = [...new Set(testIds)];
        const timings = {
            validationMs: 0,
            pricingResolutionMs: 0,
            counterOrderNumberGenerationMs: 0,
            sampleInsertMs: 0,
            orderTestInsertMs: 0,
            responseBuildMs: 0,
        };
        try {
            const validationStartedAt = process.hrtime.bigint();
            const patientPromise = this.patientRepo.findOne({
                where: { id: dto.patientId },
            });
            const labPromise = this.labRepo.findOne({ where: { id: labId } });
            const shiftPromise = dto.shiftId
                ? this.shiftRepo.findOne({
                    where: { id: dto.shiftId, labId },
                })
                : Promise.resolve(null);
            const testsPromise = uniqueTestIds.length > 0
                ? this.testRepo.find({
                    where: uniqueTestIds.map((id) => ({ id, labId })),
                })
                : Promise.resolve([]);
            const [patient, lab, shift, tests] = await Promise.all([
                patientPromise,
                labPromise,
                shiftPromise,
                testsPromise,
            ]);
            if (!patient) {
                throw new common_1.NotFoundException('Patient not found');
            }
            if (!lab) {
                throw new common_1.NotFoundException('Lab not found');
            }
            if (dto.shiftId && !shift) {
                throw new common_1.NotFoundException('Shift not found or not assigned to this lab');
            }
            if (tests.length !== uniqueTestIds.length) {
                throw new common_1.NotFoundException('One or more tests not found');
            }
            const testMap = new Map(tests.map((test) => [test.id, test]));
            timings.validationMs = this.elapsedMs(validationStartedAt);
            const pricingStartedAt = process.hrtime.bigint();
            const patientType = dto.patientType || order_entity_1.PatientType.WALK_IN;
            const deliveryMethods = this.normalizeDeliveryMethods(dto.deliveryMethods);
            const pricingValues = uniqueTestIds.length > 0
                ? await Promise.all(uniqueTestIds.map((testId) => this.findPricing(labId, testId, dto.shiftId || null, patientType)))
                : [];
            const precomputedPricingMap = new Map();
            uniqueTestIds.forEach((id, idx) => precomputedPricingMap.set(id, pricingValues[idx]));
            const totalAmount = pricingValues.reduce((sum, value) => sum + value, 0);
            const discountPercent = Math.min(100, Math.max(0, dto.discountPercent ?? 0));
            const finalAmount = Math.round(totalAmount * (1 - discountPercent / 100) * 100) / 100;
            timings.pricingResolutionMs = this.elapsedMs(pricingStartedAt);
            const labelSequenceBy = lab.labelSequenceBy === 'department' ? 'department' : 'tube_type';
            const sequenceResetBy = lab.sequenceResetBy === 'shift' ? 'shift' : 'day';
            const effectiveShiftId = sequenceResetBy === 'shift' ? dto.shiftId || null : null;
            const samplesToCreate = labelSequenceBy === 'department'
                ? this.splitSamplesForDepartmentLabels(dto.samples, testMap)
                : dto.samples;
            return await this.orderRepo.manager.transaction(async (manager) => {
                const orderRepo = manager.getRepository(order_entity_1.Order);
                const sampleRepo = manager.getRepository(sample_entity_1.Sample);
                const now = new Date();
                const labTimeZone = (0, lab_timezone_util_1.normalizeLabTimeZone)(lab.timezone);
                const counterDateKey = (0, lab_timezone_util_1.formatDateKeyForTimeZone)(now, labTimeZone);
                const counterStartedAt = process.hrtime.bigint();
                const orderNumber = await this.generateOrderNumber(labId, dto.shiftId || null, 1, manager, {
                    now,
                    timeZone: labTimeZone,
                    dateKey: counterDateKey,
                });
                timings.counterOrderNumberGenerationMs = this.elapsedMs(counterStartedAt);
                const orderId = (0, crypto_1.randomUUID)();
                await orderRepo.insert({
                    id: orderId,
                    patientId: dto.patientId,
                    labId,
                    shiftId: dto.shiftId || null,
                    orderNumber,
                    status: order_entity_1.OrderStatus.REGISTERED,
                    patientType,
                    notes: dto.notes || null,
                    totalAmount,
                    discountPercent,
                    finalAmount,
                    paymentStatus: 'unpaid',
                    paidAmount: null,
                    registeredAt: now,
                    deliveryMethods,
                });
                const sampleInsertStartedAt = process.hrtime.bigint();
                const samplesToInsert = [];
                const bulkTestData = [];
                for (const sampleDto of samplesToCreate) {
                    const sampleRowId = (0, crypto_1.randomUUID)();
                    const scopeKey = labelSequenceBy === 'department'
                        ? this.resolveSampleDepartmentScope(sampleDto.tests, testMap)
                        : (sampleDto.tubeType ?? null);
                    const sequenceNumber = await this.getNextSequenceForScope(labId, sequenceResetBy, effectiveShiftId, scopeKey, labelSequenceBy, counterDateKey, manager);
                    samplesToInsert.push({
                        id: sampleRowId,
                        labId,
                        orderId,
                        sampleId: null,
                        tubeType: sampleDto.tubeType || null,
                        barcode: orderNumber,
                        sequenceNumber,
                        qrCode: null,
                    });
                    const testsForSample = (sampleDto.tests ?? [])
                        .map((selected) => testMap.get(selected.testId))
                        .filter((entry) => Boolean(entry));
                    bulkTestData.push({ sampleId: sampleRowId, tests: testsForSample });
                }
                if (samplesToInsert.length > 0) {
                    await sampleRepo.insert(samplesToInsert);
                }
                timings.sampleInsertMs = this.elapsedMs(sampleInsertStartedAt);
                const orderTestInsertStartedAt = process.hrtime.bigint();
                const rootTestsCount = await this.bulkCreateOrderTests(manager, labId, bulkTestData, dto.shiftId ?? null, patientType, precomputedPricingMap);
                timings.orderTestInsertMs = this.elapsedMs(orderTestInsertStartedAt);
                const responseBuildStartedAt = process.hrtime.bigint();
                if (view === create_order_response_dto_1.CreateOrderView.FULL) {
                    const fullOrder = await orderRepo.findOne({
                        where: { id: orderId },
                        relations: ['patient', 'lab', 'shift', 'samples', 'samples.orderTests', 'samples.orderTests.test'],
                    });
                    timings.responseBuildMs = this.elapsedMs(responseBuildStartedAt);
                    if (!fullOrder) {
                        throw new common_1.NotFoundException('Order not found');
                    }
                    return fullOrder;
                }
                const summary = {
                    id: orderId,
                    orderNumber,
                    status: order_entity_1.OrderStatus.REGISTERED,
                    registeredAt: now,
                    deliveryMethods,
                    paymentStatus: 'unpaid',
                    paidAmount: null,
                    totalAmount: Math.round(totalAmount * 100) / 100,
                    discountPercent,
                    finalAmount,
                    patient,
                    shift: shift
                        ? {
                            id: shift.id,
                            code: shift.code,
                            name: shift.name,
                        }
                        : null,
                    testsCount: rootTestsCount,
                    readyTestsCount: 0,
                    reportReady: false,
                };
                timings.responseBuildMs = this.elapsedMs(responseBuildStartedAt);
                return summary;
            });
        }
        finally {
            const totalMs = this.elapsedMs(totalStartedAt);
            if (totalMs >= this.createPerfLogThresholdMs) {
                this.logger.warn(JSON.stringify({
                    event: 'orders.create.performance',
                    labId,
                    view,
                    durationMs: Math.round(totalMs * 100) / 100,
                    requestedSamplesCount: dto.samples.length,
                    requestedTestsCount,
                    uniqueTestsCount: uniqueTestIds.length,
                    timingsMs: {
                        validation: Math.round(timings.validationMs * 100) / 100,
                        pricingResolution: Math.round(timings.pricingResolutionMs * 100) / 100,
                        counterOrderNumberGeneration: Math.round(timings.counterOrderNumberGenerationMs * 100) / 100,
                        sampleInsert: Math.round(timings.sampleInsertMs * 100) / 100,
                        orderTestInsert: Math.round(timings.orderTestInsertMs * 100) / 100,
                        responseBuild: Math.round(timings.responseBuildMs * 100) / 100,
                    },
                }));
            }
        }
    }
    async findAll(labId, params) {
        const page = Math.max(1, params.page ?? 1);
        const size = Math.min(100, Math.max(1, params.size ?? 20));
        const skip = (page - 1) * size;
        const qb = this.orderRepo
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.patient', 'patient')
            .leftJoinAndSelect('order.shift', 'shift')
            .leftJoinAndSelect('order.samples', 'samples')
            .leftJoinAndSelect('samples.orderTests', 'orderTests')
            .leftJoinAndSelect('orderTests.test', 'test')
            .where('order.labId = :labId', { labId });
        await this.applyOrderQueryFilters(qb, labId, params);
        qb.orderBy('order.registeredAt', 'DESC').skip(skip).take(size);
        const [items, total] = await qb.getManyAndCount();
        await this.enrichOrdersWithProgress(items);
        return {
            items,
            total,
            page,
            size,
            totalPages: Math.ceil(total / size),
        };
    }
    async findHistory(labId, params) {
        const startedAt = process.hrtime.bigint();
        const page = Math.max(1, params.page ?? 1);
        const size = Math.min(100, Math.max(1, params.size ?? 20));
        const skip = (page - 1) * size;
        let total = 0;
        let itemsCount = 0;
        try {
            const qb = this.orderRepo
                .createQueryBuilder('order')
                .leftJoinAndSelect('order.patient', 'patient')
                .leftJoinAndSelect('order.shift', 'shift')
                .where('order.labId = :labId', { labId });
            await this.applyOrderQueryFilters(qb, labId, params);
            qb.orderBy('order.registeredAt', 'DESC').skip(skip).take(size);
            const [orders, nextTotal] = await qb.getManyAndCount();
            total = nextTotal;
            await this.enrichOrdersWithProgress(orders);
            const items = orders.map((order) => {
                const payload = order;
                const testsCount = Number(payload.testsCount ?? 0) || 0;
                const readyTestsCount = Number(payload.readyTestsCount ?? 0) || 0;
                const pendingTestsCount = Number(payload.pendingTestsCount ?? 0) || 0;
                const completedTestsCount = Number(payload.completedTestsCount ?? 0) || 0;
                const verifiedTestsCount = Number(payload.verifiedTestsCount ?? 0) || 0;
                const rejectedTestsCount = Number(payload.rejectedTestsCount ?? 0) || 0;
                const reportReady = Boolean(payload.reportReady) || readyTestsCount > 0;
                const resultStatus = this.normalizeOrderResultStatus(payload.resultStatus, {
                    testsCount,
                    completedTestsCount,
                    verifiedTestsCount,
                    rejectedTestsCount,
                });
                return {
                    id: order.id,
                    orderNumber: order.orderNumber,
                    status: order.status,
                    registeredAt: order.registeredAt,
                    deliveryMethods: this.normalizeDeliveryMethods(order.deliveryMethods),
                    paymentStatus: this.normalizePaymentStatus(order.paymentStatus),
                    paidAmount: order.paidAmount != null ? Number(order.paidAmount) : null,
                    finalAmount: Number(order.finalAmount ?? 0),
                    patient: order.patient,
                    shift: order.shift ?? null,
                    testsCount,
                    readyTestsCount,
                    reportReady,
                    resultStatus,
                    pendingTestsCount,
                    completedTestsCount,
                    verifiedTestsCount,
                    rejectedTestsCount,
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
            if (durationMs >= this.orderHistoryPerfLogThresholdMs) {
                this.logger.warn(JSON.stringify({
                    event: 'orders.history.performance',
                    labId,
                    page,
                    size,
                    total,
                    itemsCount,
                    durationMs: Math.round(durationMs * 100) / 100,
                    filters: {
                        status: params.status ?? null,
                        resultStatus: params.resultStatus ?? null,
                        hasSearch: Boolean(params.search?.trim()),
                        patientId: params.patientId ?? null,
                        shiftId: params.shiftId ?? null,
                        startDate: params.startDate ?? null,
                        endDate: params.endDate ?? null,
                    },
                }));
            }
        }
    }
    async findOne(id, labId, view = create_order_response_dto_1.OrderDetailView.COMPACT) {
        const startedAt = process.hrtime.bigint();
        try {
            const order = await this.orderRepo.findOne({
                where: { id, labId },
                relations: [
                    'patient',
                    'lab',
                    'shift',
                    'samples',
                    'samples.orderTests',
                    'samples.orderTests.test',
                ],
            });
            if (!order) {
                throw new common_1.NotFoundException('Order not found');
            }
            return this.stripHeavyOrderPayload(order, view);
        }
        finally {
            const durationMs = this.elapsedMs(startedAt);
            if (durationMs >= this.orderHistoryPerfLogThresholdMs) {
                this.logger.warn(JSON.stringify({
                    event: 'orders.findOne.performance',
                    labId,
                    orderId: id,
                    view,
                    durationMs: Math.round(durationMs * 100) / 100,
                }));
            }
        }
    }
    async updatePayment(id, labId, data) {
        const order = await this.orderRepo.findOne({ where: { id, labId } });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        order.paymentStatus = data.paymentStatus;
        if (data.paidAmount !== undefined) {
            order.paidAmount = data.paidAmount;
        }
        else if (data.paymentStatus === 'paid') {
            order.paidAmount = Number(order.finalAmount);
        }
        else if (data.paymentStatus === 'unpaid') {
            order.paidAmount = null;
        }
        await this.orderRepo.save(order);
        return this.findOne(id, labId);
    }
    async updateDiscount(id, labId, discountPercent) {
        const order = await this.orderRepo.findOne({ where: { id, labId } });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        if (order.status === order_entity_1.OrderStatus.CANCELLED) {
            throw new common_1.BadRequestException('Cancelled order cannot be edited');
        }
        const normalizedDiscount = Math.min(100, Math.max(0, Number(discountPercent ?? 0)));
        const totalAmount = Math.round(Number(order.totalAmount ?? 0) * 100) / 100;
        const finalAmount = Math.round(totalAmount * (1 - normalizedDiscount / 100) * 100) / 100;
        const normalizedPaymentStatus = this.normalizePaymentStatus(order.paymentStatus);
        const nextPaidAmount = normalizedPaymentStatus === 'paid'
            ? finalAmount
            : normalizedPaymentStatus === 'partial' && order.paidAmount != null
                ? Math.min(Number(order.paidAmount), finalAmount)
                : order.paidAmount;
        await this.orderRepo.update({ id, labId }, {
            discountPercent: normalizedDiscount,
            finalAmount,
            paidAmount: nextPaidAmount,
        });
        return this.findOne(id, labId);
    }
    async updateDeliveryMethods(id, labId, deliveryMethods) {
        const order = await this.orderRepo.findOne({ where: { id, labId } });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        order.deliveryMethods = this.normalizeDeliveryMethods(deliveryMethods);
        await this.orderRepo.save(order);
        return this.findOne(id, labId);
    }
    async updateOrderTests(id, labId, testIds, actor, actorRole, options) {
        const uniqueTestIds = [...new Set((testIds ?? []).map((testId) => testId?.trim()).filter(Boolean))];
        if (uniqueTestIds.length === 0) {
            throw new common_1.BadRequestException('At least one test is required');
        }
        const desiredSet = new Set(uniqueTestIds);
        const requestedRemovalReason = options?.removalReason?.trim() || null;
        const forceRemoveLockedTests = options?.forceRemoveVerified === true;
        const canForceRemoveLockedTests = this.canForceRemoveLockedTests(actor, actorRole);
        const updateResult = await this.orderRepo.manager.transaction(async (manager) => {
            const orderRepo = manager.getRepository(order_entity_1.Order);
            const sampleRepo = manager.getRepository(sample_entity_1.Sample);
            const orderTestRepo = manager.getRepository(order_test_entity_1.OrderTest);
            const testRepo = manager.getRepository(test_entity_1.Test);
            const order = await orderRepo.findOne({
                where: { id, labId },
                relations: ['samples', 'samples.orderTests', 'samples.orderTests.test', 'lab'],
            });
            if (!order) {
                throw new common_1.NotFoundException('Order not found');
            }
            if (order.status === order_entity_1.OrderStatus.CANCELLED) {
                throw new common_1.BadRequestException('Cancelled order cannot be edited');
            }
            const allOrderTests = order.samples.flatMap((sample) => sample.orderTests ?? []);
            const rootOrderTests = allOrderTests.filter((orderTest) => !orderTest.parentOrderTestId);
            const existingRootTestIdSet = new Set(rootOrderTests.map((orderTest) => orderTest.testId));
            const existingRootByTestId = new Map(rootOrderTests.map((orderTest) => [orderTest.testId, orderTest]));
            const childOrderTestsByParent = new Map();
            for (const orderTest of allOrderTests) {
                if (!orderTest.parentOrderTestId)
                    continue;
                const list = childOrderTestsByParent.get(orderTest.parentOrderTestId) ?? [];
                list.push(orderTest);
                childOrderTestsByParent.set(orderTest.parentOrderTestId, list);
            }
            const rootsToRemove = rootOrderTests
                .filter((orderTest) => !desiredSet.has(orderTest.testId))
                .map((orderTest) => {
                const childOrderTests = childOrderTestsByParent.get(orderTest.id) ?? [];
                const access = this.getRootOrderTestRemovalAccess(orderTest, childOrderTests);
                return {
                    orderTest,
                    childOrderTests,
                    access,
                };
            });
            const blockedRemovals = rootsToRemove.filter(({ access }) => !access.removable);
            if (blockedRemovals.length > 0) {
                const labels = blockedRemovals
                    .map(({ orderTest }) => this.getOrderTestLabel(orderTest))
                    .join(', ');
                const reasons = Array.from(new Set(blockedRemovals
                    .map(({ access }) => access.blockedReason?.trim())
                    .filter((reason) => Boolean(reason)))).join(' ');
                throw new common_1.BadRequestException(`Cannot remove tests: ${labels}.${reasons ? ` ${reasons}` : ''}`);
            }
            const adminOverrideRemovals = rootsToRemove.filter(({ access }) => access.requiresAdminOverride);
            if (adminOverrideRemovals.length > 0) {
                const labels = adminOverrideRemovals
                    .map(({ orderTest }) => this.getOrderTestLabel(orderTest))
                    .join(', ');
                if (!canForceRemoveLockedTests || !forceRemoveLockedTests) {
                    throw new common_1.BadRequestException(`Lab-admin override is required to remove these tests: ${labels}.`);
                }
                if (!requestedRemovalReason) {
                    throw new common_1.BadRequestException('Removal reason is required when removing tests with admin override.');
                }
            }
            const tests = await testRepo.find({
                where: uniqueTestIds.map((testId) => ({ id: testId, labId })),
            });
            if (tests.length !== uniqueTestIds.length) {
                throw new common_1.NotFoundException('One or more selected tests not found');
            }
            const inactiveNewTests = tests.filter((test) => !test.isActive && !existingRootTestIdSet.has(test.id));
            if (inactiveNewTests.length > 0) {
                throw new common_1.BadRequestException('Cannot add inactive tests to an existing order');
            }
            const testMap = new Map(tests.map((test) => [test.id, test]));
            const rootIdsToRemove = rootsToRemove.map(({ orderTest }) => orderTest.id);
            if (rootIdsToRemove.length > 0) {
                await orderTestRepo.delete(rootIdsToRemove);
            }
            const refreshedSamples = await sampleRepo.find({
                where: { orderId: order.id },
                relations: ['orderTests', 'orderTests.test'],
                order: { createdAt: 'ASC' },
            });
            const labelSequenceBy = order.lab?.labelSequenceBy === 'department' ? 'department' : 'tube_type';
            const sequenceResetBy = order.lab?.sequenceResetBy === 'shift' ? 'shift' : 'day';
            const effectiveShiftId = sequenceResetBy === 'shift' ? order.shiftId ?? null : null;
            const counterDateKey = (0, lab_timezone_util_1.formatDateKeyForTimeZone)(new Date(), (0, lab_timezone_util_1.normalizeLabTimeZone)(order.lab?.timezone));
            const sampleByScope = new Map();
            for (const sample of refreshedSamples) {
                const departmentIds = Array.from(new Set((sample.orderTests ?? []).map((orderTest) => orderTest.test?.departmentId ?? null)));
                const sampleDepartmentId = departmentIds.length === 1 ? departmentIds[0] : null;
                const scopeMapKey = this.buildSampleGroupingKey(labelSequenceBy, sample.tubeType ?? null, sampleDepartmentId);
                if (!sampleByScope.has(scopeMapKey)) {
                    sampleByScope.set(scopeMapKey, sample);
                }
            }
            const bulkTestsBySample = new Map();
            for (const testId of uniqueTestIds) {
                if (existingRootByTestId.has(testId)) {
                    continue;
                }
                const test = testMap.get(testId);
                if (!test) {
                    continue;
                }
                const testTubeType = test.tubeType ?? null;
                const testDepartmentId = labelSequenceBy === 'department' ? test.departmentId ?? null : null;
                const sampleScopeKey = this.buildSampleGroupingKey(labelSequenceBy, testTubeType, testDepartmentId);
                let targetSample = sampleByScope.get(sampleScopeKey);
                if (!targetSample) {
                    const scopeKey = labelSequenceBy === 'department'
                        ? (test.departmentId ?? null)
                        : (test.tubeType ?? null);
                    const sequenceNumber = await this.getNextSequenceForScope(labId, sequenceResetBy, effectiveShiftId, scopeKey, labelSequenceBy, counterDateKey, manager);
                    const createdSample = sampleRepo.create({
                        labId,
                        orderId: order.id,
                        sampleId: null,
                        tubeType: testTubeType,
                        barcode: order.orderNumber ?? null,
                        sequenceNumber,
                        qrCode: null,
                    });
                    targetSample = await sampleRepo.save(createdSample);
                    sampleByScope.set(sampleScopeKey, targetSample);
                }
                const list = bulkTestsBySample.get(targetSample.id) || [];
                list.push(test);
                bulkTestsBySample.set(targetSample.id, list);
            }
            const bulkTestData = Array.from(bulkTestsBySample.entries()).map(([sampleId, tests]) => ({
                sampleId,
                tests,
            }));
            if (bulkTestData.length > 0) {
                await this.bulkCreateOrderTests(manager, labId, bulkTestData, order.shiftId ?? null, order.patientType);
            }
            await manager
                .createQueryBuilder()
                .delete()
                .from(sample_entity_1.Sample)
                .where(`"orderId" = :orderId`, { orderId: order.id })
                .andWhere(`NOT EXISTS (
            SELECT 1
            FROM "order_tests" ot
            WHERE ot."sampleId" = "samples"."id"
          )`)
                .execute();
            const subtotalRow = await orderTestRepo
                .createQueryBuilder('ot')
                .innerJoin('ot.sample', 'sample')
                .select('COALESCE(SUM(ot.price), 0)', 'subtotal')
                .where('sample.orderId = :orderId', { orderId: order.id })
                .andWhere('ot.parentOrderTestId IS NULL')
                .getRawOne();
            const subtotal = Number(subtotalRow?.subtotal ?? 0);
            const normalizedDiscount = Math.min(100, Math.max(0, Number(order.discountPercent ?? 0)));
            order.totalAmount = Math.round(subtotal * 100) / 100;
            order.finalAmount =
                Math.round(order.totalAmount * (1 - normalizedDiscount / 100) * 100) / 100;
            const normalizedPaymentStatus = this.normalizePaymentStatus(order.paymentStatus);
            const nextPaidAmount = this.resolveUpdatedPaidAmount(normalizedPaymentStatus, order.paidAmount != null ? Number(order.paidAmount) : null, order.finalAmount);
            const addedRootTests = uniqueTestIds.filter((testId) => !existingRootByTestId.has(testId));
            const remainingRootStatuses = [
                ...rootOrderTests
                    .filter((orderTest) => !rootIdsToRemove.includes(orderTest.id))
                    .map((orderTest) => orderTest.status),
                ...addedRootTests.map(() => order_test_entity_1.OrderTestStatus.PENDING),
            ];
            order.status = remainingRootStatuses.some((status) => status === order_test_entity_1.OrderTestStatus.PENDING || status === order_test_entity_1.OrderTestStatus.IN_PROGRESS)
                ? order_entity_1.OrderStatus.REGISTERED
                : order_entity_1.OrderStatus.COMPLETED;
            await orderRepo.update({ id: order.id, labId }, {
                totalAmount: order.totalAmount,
                finalAmount: order.finalAmount,
                paidAmount: nextPaidAmount,
                status: order.status,
            });
            return {
                orderId: order.id,
                originalRootTests: rootOrderTests.map((orderTest) => this.buildRootOrderTestAuditItem(orderTest, childOrderTestsByParent.get(orderTest.id) ?? [], false)),
                removedRootTests: rootsToRemove.map(({ orderTest, childOrderTests, access }) => this.buildRootOrderTestAuditItem(orderTest, childOrderTests, access.requiresAdminOverride)),
                addedTests: addedRootTests
                    .map((testId) => testMap.get(testId))
                    .filter((test) => Boolean(test))
                    .map((test) => ({
                    id: test.id,
                    code: test.code,
                    name: test.name,
                })),
                adminRemovalOverrideUsed: adminOverrideRemovals.length > 0,
                removalReason: adminOverrideRemovals.length > 0 ? requestedRemovalReason : null,
            };
        });
        if (updateResult.removedRootTests.length > 0 || updateResult.addedTests.length > 0) {
            const removedLabels = updateResult.removedRootTests
                .map((item) => item.code || item.name || item.testId)
                .join(', ');
            const addedLabels = updateResult.addedTests
                .map((item) => item.code || item.name || item.id)
                .join(', ');
            const descriptionParts = ['Updated order tests'];
            if (removedLabels) {
                descriptionParts.push(`removed ${removedLabels}`);
            }
            if (addedLabels) {
                descriptionParts.push(`added ${addedLabels}`);
            }
            await this.auditService.log({
                actorType: actor.actorType,
                actorId: actor.actorId,
                labId,
                userId: actor.userId,
                action: audit_log_entity_1.AuditAction.ORDER_UPDATE,
                entityType: 'order',
                entityId: updateResult.orderId,
                oldValues: {
                    rootTests: updateResult.originalRootTests,
                },
                newValues: {
                    testIds: uniqueTestIds,
                    removedRootTests: updateResult.removedRootTests,
                    addedTests: updateResult.addedTests,
                    adminRemovalOverrideUsed: updateResult.adminRemovalOverrideUsed,
                    removalReason: updateResult.removalReason,
                },
                description: descriptionParts.join('; '),
            });
        }
        return this.findOne(updateResult.orderId, labId);
    }
    splitSamplesForDepartmentLabels(samples, testMap) {
        const groupedSamples = new Map();
        for (const sample of samples) {
            for (const selectedTest of sample.tests ?? []) {
                const test = testMap.get(selectedTest.testId);
                if (!test)
                    continue;
                const departmentId = test.departmentId ?? '__none__';
                const tubeType = (test.tubeType ?? sample.tubeType ?? null);
                const groupKey = `${departmentId}::${tubeType ?? '__none__'}`;
                let groupedSample = groupedSamples.get(groupKey);
                if (!groupedSample) {
                    groupedSample = {
                        tubeType: tubeType ?? undefined,
                        tests: [],
                    };
                    groupedSamples.set(groupKey, groupedSample);
                }
                if (!groupedSample.tests.some((entry) => entry.testId === selectedTest.testId)) {
                    groupedSample.tests.push({ testId: selectedTest.testId });
                }
            }
        }
        return Array.from(groupedSamples.values()).filter((sample) => sample.tests.length > 0);
    }
    resolveSampleDepartmentScope(tests, testMap) {
        for (const selectedTest of tests ?? []) {
            const departmentId = testMap.get(selectedTest.testId)?.departmentId ?? null;
            if (departmentId)
                return departmentId;
        }
        return null;
    }
    buildSampleGroupingKey(labelSequenceBy, tubeType, departmentId) {
        if (labelSequenceBy === 'department') {
            return `department:${departmentId ?? 'none'}|tube:${tubeType ?? 'none'}`;
        }
        return `tube:${tubeType ?? 'none'}`;
    }
    async bulkCreateOrderTests(manager, labId, sampleWithTestsArr, shiftId, patientType, precomputedPricingMap) {
        const allTestIds = new Set();
        const panelTestIdSet = new Set();
        for (const item of sampleWithTestsArr) {
            for (const t of item.tests) {
                allTestIds.add(t.id);
                if (t.type === test_entity_1.TestType.PANEL) {
                    panelTestIdSet.add(t.id);
                }
            }
        }
        const uniqueTestIds = Array.from(allTestIds);
        if (uniqueTestIds.length === 0)
            return 0;
        let pricingMap = precomputedPricingMap;
        if (!pricingMap) {
            pricingMap = new Map();
            const pricingValues = await Promise.all(uniqueTestIds.map((testId) => this.findPricing(labId, testId, shiftId, patientType)));
            uniqueTestIds.forEach((id, idx) => pricingMap.set(id, pricingValues[idx]));
        }
        const panelTestIds = Array.from(panelTestIdSet);
        const componentsByPanelId = new Map();
        if (panelTestIds.length > 0) {
            const allComponents = await manager.getRepository(test_component_entity_1.TestComponent)
                .createQueryBuilder('component')
                .innerJoinAndSelect('component.childTest', 'childTest')
                .where('component.panelTestId IN (:...panelTestIds)', { panelTestIds })
                .andWhere('childTest.labId = :labId', { labId })
                .orderBy('component.sortOrder', 'ASC')
                .getMany();
            for (const comp of allComponents) {
                const existing = componentsByPanelId.get(comp.panelTestId) ?? [];
                existing.push(comp);
                componentsByPanelId.set(comp.panelTestId, existing);
            }
        }
        const rows = [];
        let rootTestsCount = 0;
        for (const { sampleId, tests } of sampleWithTestsArr) {
            for (const test of tests) {
                const price = pricingMap.get(test.id) ?? 0;
                rootTestsCount += 1;
                if (test.type === test_entity_1.TestType.PANEL) {
                    const parentId = (0, crypto_1.randomUUID)();
                    rows.push({
                        id: parentId,
                        labId,
                        sampleId,
                        testId: test.id,
                        parentOrderTestId: null,
                        status: order_test_entity_1.OrderTestStatus.PENDING,
                        price,
                    });
                    const components = componentsByPanelId.get(test.id) ?? [];
                    for (const comp of components) {
                        rows.push({
                            labId,
                            sampleId,
                            testId: comp.childTestId,
                            parentOrderTestId: parentId,
                            status: order_test_entity_1.OrderTestStatus.PENDING,
                            price: null,
                            panelSortOrder: comp.sortOrder ?? null,
                        });
                    }
                }
                else {
                    rows.push({
                        labId,
                        sampleId,
                        testId: test.id,
                        parentOrderTestId: null,
                        status: order_test_entity_1.OrderTestStatus.PENDING,
                        price,
                    });
                }
            }
        }
        if (rows.length > 0) {
            for (let offset = 0; offset < rows.length; offset += this.orderTestInsertChunkSize) {
                const chunk = rows.slice(offset, offset + this.orderTestInsertChunkSize);
                await manager
                    .createQueryBuilder()
                    .insert()
                    .into(order_test_entity_1.OrderTest)
                    .values(chunk)
                    .execute();
            }
        }
        return rootTestsCount;
    }
    createOrderSampleBarcodeAllocator(orderNumber, existingBarcodes) {
        const normalizedOrderNumber = orderNumber?.trim() ?? '';
        const normalizedBarcodes = existingBarcodes
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value) => value.length > 0);
        if (/^\d+$/.test(normalizedOrderNumber)) {
            const width = normalizedOrderNumber.length;
            let maxValue = Number(normalizedOrderNumber);
            for (const barcode of normalizedBarcodes) {
                if (!/^\d+$/.test(barcode))
                    continue;
                const value = Number(barcode);
                if (Number.isFinite(value) && value > maxValue) {
                    maxValue = value;
                }
            }
            return () => {
                maxValue += 1;
                return String(maxValue).padStart(width, '0');
            };
        }
        let fallbackSeq = normalizedBarcodes.length;
        const prefix = normalizedOrderNumber || 'ORD';
        return () => {
            fallbackSeq += 1;
            return `${prefix}-${String(fallbackSeq).padStart(2, '0')}`;
        };
    }
    canForceRemoveLockedTests(actor, actorRole) {
        return (actor.isImpersonation ||
            actorRole === 'LAB_ADMIN' ||
            actorRole === 'SUPER_ADMIN');
    }
    getRootOrderTestRemovalAccess(rootOrderTest, childOrderTests) {
        const subtree = [rootOrderTest, ...childOrderTests];
        const hasVerified = subtree.some((orderTest) => orderTest.status === order_test_entity_1.OrderTestStatus.VERIFIED);
        if (hasVerified) {
            return {
                removable: true,
                requiresAdminOverride: true,
                blockedReason: null,
            };
        }
        if (rootOrderTest.status === order_test_entity_1.OrderTestStatus.REJECTED) {
            return {
                removable: true,
                requiresAdminOverride: false,
                blockedReason: null,
            };
        }
        if (rootOrderTest.status === order_test_entity_1.OrderTestStatus.COMPLETED) {
            return {
                removable: true,
                requiresAdminOverride: false,
                blockedReason: null,
            };
        }
        if (rootOrderTest.status === order_test_entity_1.OrderTestStatus.IN_PROGRESS &&
            childOrderTests.length > 0) {
            return {
                removable: true,
                requiresAdminOverride: true,
                blockedReason: null,
            };
        }
        if (rootOrderTest.status === order_test_entity_1.OrderTestStatus.PENDING &&
            childOrderTests.every((orderTest) => orderTest.status === order_test_entity_1.OrderTestStatus.PENDING)) {
            return {
                removable: true,
                requiresAdminOverride: false,
                blockedReason: null,
            };
        }
        return {
            removable: false,
            requiresAdminOverride: false,
            blockedReason: 'Only pending, completed, and rejected tests can be removed. In-progress tests stay locked.',
        };
    }
    buildRootOrderTestAuditItem(rootOrderTest, childOrderTests, requiresAdminOverride) {
        return {
            id: rootOrderTest.id,
            testId: rootOrderTest.testId,
            code: rootOrderTest.test?.code ?? '',
            name: rootOrderTest.test?.name ?? '',
            status: rootOrderTest.status,
            requiresAdminOverride,
            isPanel: childOrderTests.length > 0,
        };
    }
    getOrderTestLabel(orderTest) {
        return orderTest.test?.code || orderTest.test?.name || orderTest.testId;
    }
    resolveUpdatedPaidAmount(paymentStatus, currentPaidAmount, finalAmount) {
        if (paymentStatus === 'unpaid') {
            return null;
        }
        if (paymentStatus === 'paid') {
            return finalAmount;
        }
        if (currentPaidAmount == null) {
            return null;
        }
        return Math.min(Number(currentPaidAmount), finalAmount);
    }
    async findPricing(labId, testId, shiftId, patientType) {
        const baseQb = this.pricingRepo
            .createQueryBuilder('pricing')
            .where('pricing.labId = :labId', { labId })
            .andWhere('pricing.testId = :testId', { testId })
            .andWhere('pricing.isActive = :isActive', { isActive: true });
        const genericQb = baseQb.clone().andWhere('pricing.patientType IS NULL');
        if (shiftId) {
            genericQb
                .andWhere('(pricing.shiftId = :shiftId OR pricing.shiftId IS NULL)', { shiftId })
                .orderBy('CASE WHEN pricing.shiftId = :shiftId THEN 0 ELSE 1 END', 'ASC')
                .addOrderBy('pricing.createdAt', 'DESC');
        }
        else {
            genericQb
                .andWhere('pricing.shiftId IS NULL')
                .orderBy('pricing.createdAt', 'DESC');
        }
        genericQb.limit(1);
        const genericPricing = await genericQb.getOne();
        if (genericPricing) {
            return parseFloat(genericPricing.price.toString());
        }
        const specificQb = baseQb.clone().andWhere('pricing.patientType = :patientType', { patientType });
        if (shiftId) {
            specificQb
                .andWhere('(pricing.shiftId = :shiftId OR pricing.shiftId IS NULL)', { shiftId })
                .orderBy('CASE WHEN pricing.shiftId = :shiftId THEN 0 ELSE 1 END', 'ASC')
                .addOrderBy('pricing.createdAt', 'DESC');
        }
        else {
            specificQb
                .andWhere('pricing.shiftId IS NULL')
                .orderBy('pricing.createdAt', 'DESC');
        }
        specificQb.limit(1);
        const specificPricing = await specificQb.getOne();
        if (specificPricing) {
            return parseFloat(specificPricing.price.toString());
        }
        const fallback = await this.pricingRepo.findOne({
            where: { labId, testId, isActive: true },
            order: { createdAt: 'DESC' },
        });
        return fallback ? parseFloat(fallback.price.toString()) : 0;
    }
    async getNextOrderNumber(labId, shiftId) {
        return this.computeNextOrderNumber(labId, shiftId);
    }
    async generateOrderNumber(labId, _shiftId, increment = 1, manager = this.orderRepo.manager, options) {
        const now = options?.now ?? new Date();
        const timeZone = options?.timeZone ?? (await this.getLabTimeZone(labId, manager));
        const dateKey = options?.dateKey ?? (0, lab_timezone_util_1.formatDateKeyForTimeZone)(now, timeZone);
        const dateStr = (0, lab_timezone_util_1.formatOrderDatePrefixForTimeZone)(now, timeZone);
        const floor = await this.getMaxOrderSequenceForDate(labId, dateStr, manager);
        const nextSeq = await (0, lab_counter_util_1.nextLabCounterValueWithFloor)(manager, {
            labId,
            counterType: 'ORDER_NUMBER',
            scopeKey: 'ORDER',
            date: now,
            dateKey,
            shiftId: null,
        }, floor, increment);
        return `${dateStr}${String(nextSeq).padStart(3, '0')}`;
    }
    async computeNextOrderNumber(labId, _shiftId) {
        const now = new Date();
        const timeZone = await this.getLabTimeZone(labId);
        const dateKey = (0, lab_timezone_util_1.formatDateKeyForTimeZone)(now, timeZone);
        const dateStr = (0, lab_timezone_util_1.formatOrderDatePrefixForTimeZone)(now, timeZone);
        const floor = await this.getMaxOrderSequenceForDate(labId, dateStr);
        const counterNextSeq = await (0, lab_counter_util_1.peekNextLabCounterValue)(this.orderRepo.manager, {
            labId,
            counterType: 'ORDER_NUMBER',
            scopeKey: 'ORDER',
            date: now,
            dateKey,
            shiftId: null,
        });
        const nextSeq = Math.max(counterNextSeq, floor + 1);
        return `${dateStr}${String(nextSeq).padStart(3, '0')}`;
    }
    async getMaxOrderSequenceForDate(labId, datePrefix, manager = this.orderRepo.manager) {
        const pattern = `^${datePrefix}[0-9]{3}$`;
        const rows = await manager.query(`
        SELECT COALESCE((
          SELECT MAX(CAST(SUBSTRING("orderNumber" FROM 7 FOR 3) AS integer))
          FROM "orders"
          WHERE "labId" = $1 AND "orderNumber" ~ $2
        ), 0) AS "maxSeq"
      `, [labId, pattern]);
        const maxSeq = Number(rows?.[0]?.maxSeq ?? 0);
        if (!Number.isFinite(maxSeq) || maxSeq < 0) {
            return 0;
        }
        return Math.floor(maxSeq);
    }
    async getNextSequenceForScope(labId, sequenceResetBy, shiftId, scopeKey, labelSequenceBy, dateKey = null, manager = this.orderRepo.manager) {
        const counterType = labelSequenceBy === 'department' ? 'SAMPLE_SEQUENCE_DEPARTMENT' : 'SAMPLE_SEQUENCE_TUBE';
        const scopedShiftId = sequenceResetBy === 'shift' ? shiftId ?? null : null;
        return (0, lab_counter_util_1.nextLabCounterValue)(manager, {
            labId,
            counterType,
            scopeKey: scopeKey ?? '__none__',
            dateKey: dateKey ?? undefined,
            shiftId: scopedShiftId,
        });
    }
    async estimatePrice(labId, testIds, shiftId = null) {
        if (!testIds?.length)
            return { subtotal: 0 };
        const uniqueTestIds = [...new Set(testIds)];
        const patientType = order_entity_1.PatientType.WALK_IN;
        const prices = await Promise.all(uniqueTestIds.map((testId) => this.findPricing(labId, testId, shiftId, patientType)));
        const subtotal = prices.reduce((sum, value) => sum + value, 0);
        return { subtotal };
    }
    async getOrdersTodayCount(labId) {
        const timeZone = await this.getLabTimeZone(labId);
        const { startDate: startOfDay, endDate: endOfDay } = this.getDateRangeOrThrow((0, lab_timezone_util_1.formatDateKeyForTimeZone)(new Date(), timeZone), timeZone, 'today');
        return this.orderRepo.count({
            where: {
                labId,
                registeredAt: (0, typeorm_2.Between)(startOfDay, endOfDay),
            },
        });
    }
    async getTodayPatients(labId) {
        const timeZone = await this.getLabTimeZone(labId);
        const { startDate: startOfDay, endDate: endOfDay } = this.getDateRangeOrThrow((0, lab_timezone_util_1.formatDateKeyForTimeZone)(new Date(), timeZone), timeZone, 'today');
        const orders = await this.orderRepo.find({
            where: {
                labId,
                registeredAt: (0, typeorm_2.Between)(startOfDay, endOfDay),
            },
            relations: ['patient'],
            order: { registeredAt: 'DESC' },
        });
        const patientMap = new Map();
        for (const order of orders) {
            const patientId = order.patientId;
            if (!patientMap.has(patientId)) {
                patientMap.set(patientId, {
                    patient: order.patient,
                    orderCount: 1,
                    lastOrderAt: order.registeredAt,
                });
            }
            else {
                const existing = patientMap.get(patientId);
                existing.orderCount++;
                if (!existing.lastOrderAt || order.registeredAt > existing.lastOrderAt) {
                    existing.lastOrderAt = order.registeredAt;
                }
            }
        }
        return Array.from(patientMap.values()).sort((a, b) => {
            if (!a.lastOrderAt)
                return 1;
            if (!b.lastOrderAt)
                return -1;
            return b.lastOrderAt.getTime() - a.lastOrderAt.getTime();
        });
    }
    async getOrdersTrend(labId, days) {
        const timeZone = await this.getLabTimeZone(labId);
        const todayDateKey = (0, lab_timezone_util_1.formatDateKeyForTimeZone)(new Date(), timeZone);
        const startDateKey = (0, lab_timezone_util_1.addDaysToDateKey)(todayDateKey, -(days - 1));
        const { startDate } = (0, lab_timezone_util_1.getUtcRangeForLabDate)(startDateKey, timeZone);
        const { endDate } = (0, lab_timezone_util_1.getUtcRangeForLabDate)(todayDateKey, timeZone);
        const dateExpr = `("order"."registeredAt" AT TIME ZONE 'UTC' AT TIME ZONE :timeZone)::date`;
        const orders = await this.orderRepo
            .createQueryBuilder('order')
            .select(`TO_CHAR(${dateExpr}, 'YYYY-MM-DD')`, 'date')
            .addSelect('COUNT(*)', 'count')
            .where('order.labId = :labId', { labId })
            .andWhere('order.registeredAt BETWEEN :startDate AND :endDate', {
            startDate,
            endDate,
        })
            .setParameter('timeZone', timeZone)
            .groupBy(dateExpr)
            .orderBy(dateExpr, 'ASC')
            .getRawMany();
        const resultMap = new Map();
        for (let offset = 0; offset < days; offset++) {
            resultMap.set((0, lab_timezone_util_1.addDaysToDateKey)(startDateKey, offset), 0);
        }
        orders.forEach((row) => {
            const dateStr = String(row.date).slice(0, 10);
            resultMap.set(dateStr, parseInt(row.count, 10) || 0);
        });
        return Array.from(resultMap.entries()).map(([date, count]) => ({
            date,
            count,
        }));
    }
    async getOrderStatsForPeriod(labId, startDate, endDate) {
        const base = { labId, startDate, endDate };
        const [totalRow, statusRows, shiftRows, revenueRow] = await Promise.all([
            this.orderRepo
                .createQueryBuilder('order')
                .select('COUNT(*)', 'count')
                .where('order.labId = :labId', { labId })
                .andWhere('order.registeredAt BETWEEN :startDate AND :endDate', base)
                .getRawOne(),
            this.orderRepo
                .createQueryBuilder('order')
                .select('order.status', 'status')
                .addSelect('COUNT(*)', 'count')
                .where('order.labId = :labId', { labId })
                .andWhere('order.registeredAt BETWEEN :startDate AND :endDate', base)
                .groupBy('order.status')
                .getRawMany(),
            this.orderRepo
                .createQueryBuilder('order')
                .leftJoin('order.shift', 'shift')
                .select('order.shiftId', 'shiftId')
                .addSelect('MAX(COALESCE(shift.name, shift.code))', 'shiftName')
                .addSelect('COUNT(*)', 'count')
                .where('order.labId = :labId', { labId })
                .andWhere('order.registeredAt BETWEEN :startDate AND :endDate', base)
                .groupBy('order.shiftId')
                .getRawMany(),
            this.orderRepo
                .createQueryBuilder('order')
                .select('COALESCE(SUM(order.finalAmount), 0)', 'revenue')
                .where('order.labId = :labId', { labId })
                .andWhere('order.registeredAt BETWEEN :startDate AND :endDate', base)
                .getRawOne(),
        ]);
        const total = parseInt(totalRow?.count ?? '0', 10);
        const byStatus = {};
        for (const s of Object.values(order_entity_1.OrderStatus)) {
            byStatus[s] = 0;
        }
        for (const row of statusRows) {
            byStatus[row.status] = parseInt(row.count, 10);
        }
        const byShift = shiftRows.map((row) => ({
            shiftId: row.shiftId,
            shiftName: row.shiftName || 'No shift',
            count: parseInt(row.count, 10),
        }));
        const revenue = parseFloat(revenueRow?.revenue ?? '0');
        return { total, byStatus, byShift, revenue };
    }
    async applyOrderQueryFilters(qb, labId, params) {
        if (params.status) {
            if (params.status === order_entity_1.OrderStatus.COMPLETED) {
                qb.andWhere(`(EXISTS (
            SELECT 1
            FROM samples s
            INNER JOIN order_tests ot ON ot."sampleId" = s.id
            WHERE s."orderId" = "order"."id"
              AND ot."parentOrderTestId" IS NULL
          )
          AND NOT EXISTS (
            SELECT 1
            FROM samples s
            INNER JOIN order_tests ot ON ot."sampleId" = s.id
            WHERE s."orderId" = "order"."id"
              AND ot."parentOrderTestId" IS NULL
              AND ot.status IN (:...pendingStatuses)
          ))`, {
                    pendingStatuses: [order_test_entity_1.OrderTestStatus.PENDING, order_test_entity_1.OrderTestStatus.IN_PROGRESS],
                });
            }
            else {
                qb.andWhere('order.status = :status', { status: params.status });
            }
        }
        if (params.patientId) {
            qb.andWhere('order.patientId = :patientId', { patientId: params.patientId });
        }
        if (params.shiftId) {
            qb.andWhere('order.shiftId = :shiftId', { shiftId: params.shiftId });
        }
        if (params.search?.trim()) {
            const term = `%${params.search.trim()}%`;
            const exactSearch = params.search.trim();
            qb.andWhere('(order.orderNumber ILIKE :term OR patient.fullName ILIKE :term OR patient.patientNumber = :exactSearch OR patient.phone ILIKE :term)', { term, exactSearch });
        }
        const labTimeZone = params.startDate || params.endDate ? await this.getLabTimeZone(labId) : null;
        if (params.startDate && params.endDate && labTimeZone) {
            const { startDate } = this.getDateRangeOrThrow(params.startDate, labTimeZone, 'startDate');
            const { endDate } = this.getDateRangeOrThrow(params.endDate, labTimeZone, 'endDate');
            if (startDate.getTime() > endDate.getTime()) {
                throw new common_1.BadRequestException('startDate cannot be after endDate');
            }
            qb.andWhere('order.registeredAt BETWEEN :startDate AND :endDate', {
                startDate,
                endDate,
            });
        }
        else if (params.startDate && labTimeZone) {
            const { startDate } = this.getDateRangeOrThrow(params.startDate, labTimeZone, 'startDate');
            qb.andWhere('order.registeredAt >= :startDate', { startDate });
        }
        else if (params.endDate && labTimeZone) {
            const { endDate } = this.getDateRangeOrThrow(params.endDate, labTimeZone, 'endDate');
            qb.andWhere('order.registeredAt <= :endDate', { endDate });
        }
        if (params.resultStatus) {
            this.applyOrderResultStatusFilter(qb, params.resultStatus);
        }
    }
    applyOrderResultStatusFilter(qb, resultStatus) {
        const hasRootTestsSql = `EXISTS (
      SELECT 1
      FROM samples s
      INNER JOIN order_tests ot ON ot."sampleId" = s.id
      WHERE s."orderId" = "order"."id"
        AND ot."parentOrderTestId" IS NULL
    )`;
        const hasRejectedSql = `EXISTS (
      SELECT 1
      FROM samples s
      INNER JOIN order_tests ot ON ot."sampleId" = s.id
      WHERE s."orderId" = "order"."id"
        AND ot."parentOrderTestId" IS NULL
        AND ot.status = :resultRejected
    )`;
        const hasNonVerifiedSql = `EXISTS (
      SELECT 1
      FROM samples s
      INNER JOIN order_tests ot ON ot."sampleId" = s.id
      WHERE s."orderId" = "order"."id"
        AND ot."parentOrderTestId" IS NULL
        AND ot.status <> :resultVerified
    )`;
        const hasCompletedSql = `EXISTS (
      SELECT 1
      FROM samples s
      INNER JOIN order_tests ot ON ot."sampleId" = s.id
      WHERE s."orderId" = "order"."id"
        AND ot."parentOrderTestId" IS NULL
        AND ot.status = :resultCompleted
    )`;
        const hasOutsideCompletedVerifiedSql = `EXISTS (
      SELECT 1
      FROM samples s
      INNER JOIN order_tests ot ON ot."sampleId" = s.id
      WHERE s."orderId" = "order"."id"
        AND ot."parentOrderTestId" IS NULL
        AND ot.status NOT IN (:...completedOrVerifiedStatuses)
    )`;
        const verifiedCondition = `(${hasRootTestsSql} AND NOT (${hasNonVerifiedSql}))`;
        const completedCondition = `(${hasCompletedSql} AND NOT (${hasOutsideCompletedVerifiedSql}))`;
        const pendingCondition = `(NOT (${hasRejectedSql}) AND NOT ${verifiedCondition} AND NOT ${completedCondition})`;
        qb.setParameter('resultRejected', order_test_entity_1.OrderTestStatus.REJECTED);
        qb.setParameter('resultVerified', order_test_entity_1.OrderTestStatus.VERIFIED);
        qb.setParameter('resultCompleted', order_test_entity_1.OrderTestStatus.COMPLETED);
        qb.setParameter('completedOrVerifiedStatuses', [
            order_test_entity_1.OrderTestStatus.COMPLETED,
            order_test_entity_1.OrderTestStatus.VERIFIED,
        ]);
        switch (resultStatus) {
            case create_order_response_dto_1.OrderResultStatus.REJECTED:
                qb.andWhere(hasRejectedSql);
                return;
            case create_order_response_dto_1.OrderResultStatus.VERIFIED:
                qb.andWhere(verifiedCondition);
                return;
            case create_order_response_dto_1.OrderResultStatus.COMPLETED:
                qb.andWhere(completedCondition);
                return;
            case create_order_response_dto_1.OrderResultStatus.PENDING:
            default:
                qb.andWhere(pendingCondition);
                return;
        }
    }
    async enrichOrdersWithProgress(items) {
        if (items.length === 0) {
            return;
        }
        const orderIds = items.map((order) => order.id);
        const testCounts = await this.orderRepo.manager
            .createQueryBuilder()
            .select('s."orderId"', 'orderId')
            .addSelect('COUNT(*) FILTER (WHERE ot."parentOrderTestId" IS NULL)', 'totalTests')
            .addSelect(`SUM(CASE WHEN ot.status IN (:...readyStatuses) AND ot."parentOrderTestId" IS NULL THEN 1 ELSE 0 END)`, 'readyTests')
            .addSelect(`SUM(CASE WHEN ot.status IN (:...pendingStatuses) AND ot."parentOrderTestId" IS NULL THEN 1 ELSE 0 END)`, 'pendingTests')
            .addSelect(`SUM(CASE WHEN ot.status = :completedStatus AND ot."parentOrderTestId" IS NULL THEN 1 ELSE 0 END)`, 'completedTests')
            .addSelect(`SUM(CASE WHEN ot.status = :verifiedStatus AND ot."parentOrderTestId" IS NULL THEN 1 ELSE 0 END)`, 'verifiedTests')
            .addSelect(`SUM(CASE WHEN ot.status = :rejectedStatus AND ot."parentOrderTestId" IS NULL THEN 1 ELSE 0 END)`, 'rejectedTests')
            .from('order_tests', 'ot')
            .innerJoin('samples', 's', 's.id = ot."sampleId"')
            .where('s."orderId" IN (:...orderIds)', { orderIds })
            .setParameter('readyStatuses', [
            order_test_entity_1.OrderTestStatus.COMPLETED,
            order_test_entity_1.OrderTestStatus.VERIFIED,
            order_test_entity_1.OrderTestStatus.REJECTED,
        ])
            .setParameter('pendingStatuses', [order_test_entity_1.OrderTestStatus.PENDING, order_test_entity_1.OrderTestStatus.IN_PROGRESS])
            .setParameter('completedStatus', order_test_entity_1.OrderTestStatus.COMPLETED)
            .setParameter('verifiedStatus', order_test_entity_1.OrderTestStatus.VERIFIED)
            .setParameter('rejectedStatus', order_test_entity_1.OrderTestStatus.REJECTED)
            .groupBy('s."orderId"')
            .getRawMany();
        const countMap = new Map(testCounts.map((row) => [
            row.orderId,
            {
                totalTests: parseInt(row.totalTests, 10) || 0,
                readyTests: parseInt(row.readyTests, 10) || 0,
                pendingTests: parseInt(row.pendingTests, 10) || 0,
                completedTests: parseInt(row.completedTests, 10) || 0,
                verifiedTests: parseInt(row.verifiedTests, 10) || 0,
                rejectedTests: parseInt(row.rejectedTests, 10) || 0,
            },
        ]));
        for (const order of items) {
            const counts = countMap.get(order.id) || {
                totalTests: 0,
                readyTests: 0,
                pendingTests: 0,
                completedTests: 0,
                verifiedTests: 0,
                rejectedTests: 0,
            };
            order.testsCount = counts.totalTests;
            order.readyTestsCount = counts.readyTests;
            order.pendingTestsCount = counts.pendingTests;
            order.completedTestsCount = counts.completedTests;
            order.verifiedTestsCount = counts.verifiedTests;
            order.rejectedTestsCount = counts.rejectedTests;
            order.reportReady = counts.readyTests > 0;
            order.resultStatus = this.normalizeOrderResultStatus(undefined, {
                testsCount: counts.totalTests,
                completedTestsCount: counts.completedTests,
                verifiedTestsCount: counts.verifiedTests,
                rejectedTestsCount: counts.rejectedTests,
            });
            if (order.status !== order_entity_1.OrderStatus.CANCELLED &&
                counts.totalTests > 0 &&
                counts.pendingTests === 0) {
                order.status = order_entity_1.OrderStatus.COMPLETED;
            }
            else if (order.status === order_entity_1.OrderStatus.COMPLETED && counts.pendingTests > 0) {
                order.status = order_entity_1.OrderStatus.IN_PROGRESS;
            }
        }
    }
    resolveCreatePerfLogThresholdMs() {
        const parsed = Number.parseInt(process.env.ORDER_CREATE_PERF_LOG_THRESHOLD_MS ?? '500', 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 500;
    }
    resolveOrderHistoryPerfLogThresholdMs() {
        const parsed = Number.parseInt(process.env.ORDER_HISTORY_PERF_LOG_THRESHOLD_MS ?? '500', 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 500;
    }
    resolveOrderTestInsertChunkSize() {
        const parsed = Number.parseInt(process.env.ORDER_TEST_INSERT_CHUNK_SIZE ?? '250', 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return 250;
        }
        return Math.max(50, Math.min(parsed, 2000));
    }
    elapsedMs(startedAt) {
        return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    }
    stripHeavyOrderPayload(order, detailView = create_order_response_dto_1.OrderDetailView.COMPACT) {
        if (!order?.lab) {
            return detailView === create_order_response_dto_1.OrderDetailView.COMPACT
                ? this.stripHeavyOrderTestsPayload(order)
                : order;
        }
        order.lab.reportBannerDataUrl = null;
        order.lab.reportFooterDataUrl = null;
        order.lab.reportLogoDataUrl = null;
        order.lab.reportWatermarkDataUrl = null;
        order.lab.onlineResultWatermarkDataUrl = null;
        order.lab.uiTestGroups = null;
        return detailView === create_order_response_dto_1.OrderDetailView.COMPACT
            ? this.stripHeavyOrderTestsPayload(order)
            : order;
    }
    stripHeavyOrderTestsPayload(order) {
        for (const sample of order.samples ?? []) {
            for (const orderTest of sample.orderTests ?? []) {
                orderTest.flag = (0, order_test_flag_util_1.normalizeOrderTestFlag)(orderTest.flag ?? null);
                const testPayload = orderTest.test;
                if (!testPayload)
                    continue;
                delete testPayload.lab;
                delete testPayload.labId;
                delete testPayload.department;
                delete testPayload.type;
                delete testPayload.unit;
                delete testPayload.normalMin;
                delete testPayload.normalMax;
                delete testPayload.normalMinMale;
                delete testPayload.normalMaxMale;
                delete testPayload.normalMinFemale;
                delete testPayload.normalMaxFemale;
                delete testPayload.normalText;
                delete testPayload.normalTextMale;
                delete testPayload.normalTextFemale;
                delete testPayload.resultEntryType;
                delete testPayload.resultTextOptions;
                delete testPayload.allowCustomResultText;
                delete testPayload.numericAgeRanges;
                delete testPayload.description;
                delete testPayload.childTestIds;
                delete testPayload.parameterDefinitions;
                delete testPayload.isActive;
                delete testPayload.sortOrder;
                delete testPayload.expectedCompletionMinutes;
                delete testPayload.createdAt;
                delete testPayload.updatedAt;
                delete testPayload.orderTests;
            }
        }
        return order;
    }
    normalizeDeliveryMethods(values) {
        if (!Array.isArray(values) || values.length === 0) {
            return [];
        }
        const stableOrder = [
            order_entity_1.DeliveryMethod.PRINT,
            order_entity_1.DeliveryMethod.WHATSAPP,
            order_entity_1.DeliveryMethod.VIBER,
        ];
        const allowed = new Set(stableOrder);
        const selected = new Set();
        for (const raw of values) {
            if (typeof raw !== 'string')
                continue;
            const normalized = raw.trim().toUpperCase();
            if (!normalized)
                continue;
            if (!allowed.has(normalized))
                continue;
            selected.add(normalized);
            if (selected.size >= 3)
                break;
        }
        return stableOrder.filter((method) => selected.has(method));
    }
    normalizePaymentStatus(value) {
        if (value === 'paid')
            return 'paid';
        if (value === 'partial')
            return 'partial';
        return 'unpaid';
    }
    normalizeOrderResultStatus(value, counts) {
        if (value === create_order_response_dto_1.OrderResultStatus.PENDING)
            return create_order_response_dto_1.OrderResultStatus.PENDING;
        if (value === create_order_response_dto_1.OrderResultStatus.COMPLETED)
            return create_order_response_dto_1.OrderResultStatus.COMPLETED;
        if (value === create_order_response_dto_1.OrderResultStatus.VERIFIED)
            return create_order_response_dto_1.OrderResultStatus.VERIFIED;
        if (value === create_order_response_dto_1.OrderResultStatus.REJECTED)
            return create_order_response_dto_1.OrderResultStatus.REJECTED;
        if (counts.rejectedTestsCount > 0) {
            return create_order_response_dto_1.OrderResultStatus.REJECTED;
        }
        if (counts.testsCount > 0 && counts.verifiedTestsCount === counts.testsCount) {
            return create_order_response_dto_1.OrderResultStatus.VERIFIED;
        }
        if (counts.completedTestsCount > 0 &&
            counts.completedTestsCount + counts.verifiedTestsCount === counts.testsCount) {
            return create_order_response_dto_1.OrderResultStatus.COMPLETED;
        }
        return create_order_response_dto_1.OrderResultStatus.PENDING;
    }
    async getLabTimeZone(labId, manager = this.orderRepo.manager) {
        const lab = await manager.getRepository(lab_entity_1.Lab).findOne({ where: { id: labId } });
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
    async getWorklist(labId, shiftId) {
        const shiftKey = shiftId ?? '';
        const row = await this.worklistRepo.findOne({ where: { labId, shiftId: shiftKey } });
        const raw = row?.itemsJson
            ? JSON.parse(row.itemsJson)
            : [];
        if (raw.length === 0)
            return [];
        const patientIds = [...new Set(raw.map((r) => r.patientId))];
        const orderIds = [...new Set(raw.map((r) => r.orderId).filter(Boolean))];
        const patients = await this.patientRepo.find({
            where: patientIds.map((id) => ({ id })),
        });
        const patientMap = new Map(patients.map((p) => [p.id, p]));
        let orders = [];
        if (orderIds.length > 0) {
            orders = await this.orderRepo.find({
                where: orderIds.map((id) => ({ id, labId })),
                relations: [
                    'patient',
                    'lab',
                    'shift',
                    'samples',
                    'samples.orderTests',
                    'samples.orderTests.test',
                ],
            });
            orders = orders.map((order) => this.stripHeavyOrderPayload(order));
        }
        const orderMap = new Map(orders.map((o) => [o.id, o]));
        return raw
            .map((item) => {
            const patient = patientMap.get(item.patientId) ?? null;
            const createdOrder = item.orderId ? orderMap.get(item.orderId) ?? null : null;
            if (!patient)
                return null;
            return { rowId: item.rowId, patient, createdOrder };
        })
            .filter((r) => r !== null);
    }
    async saveWorklist(labId, shiftId, items) {
        const shiftKey = shiftId ?? '';
        const itemsJson = JSON.stringify(items);
        await this.worklistRepo.upsert({ labId, shiftId: shiftKey, itemsJson }, ['labId', 'shiftId']);
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = OrdersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(1, (0, typeorm_1.InjectRepository)(patient_entity_1.Patient)),
    __param(2, (0, typeorm_1.InjectRepository)(lab_entity_1.Lab)),
    __param(3, (0, typeorm_1.InjectRepository)(shift_entity_1.Shift)),
    __param(4, (0, typeorm_1.InjectRepository)(test_entity_1.Test)),
    __param(5, (0, typeorm_1.InjectRepository)(pricing_entity_1.Pricing)),
    __param(6, (0, typeorm_1.InjectRepository)(test_component_entity_1.TestComponent)),
    __param(7, (0, typeorm_1.InjectRepository)(lab_orders_worklist_entity_1.LabOrdersWorklist)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        audit_service_1.AuditService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map