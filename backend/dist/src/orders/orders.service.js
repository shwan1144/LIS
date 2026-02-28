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
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
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
const lab_counter_util_1 = require("../database/lab-counter.util");
const lab_timezone_util_1 = require("../database/lab-timezone.util");
let OrdersService = class OrdersService {
    constructor(orderRepo, patientRepo, labRepo, shiftRepo, testRepo, pricingRepo, testComponentRepo, worklistRepo) {
        this.orderRepo = orderRepo;
        this.patientRepo = patientRepo;
        this.labRepo = labRepo;
        this.shiftRepo = shiftRepo;
        this.testRepo = testRepo;
        this.pricingRepo = pricingRepo;
        this.testComponentRepo = testComponentRepo;
        this.worklistRepo = worklistRepo;
    }
    async create(labId, dto) {
        const patient = await this.patientRepo.findOne({
            where: { id: dto.patientId },
        });
        if (!patient) {
            throw new common_1.NotFoundException('Patient not found');
        }
        const lab = await this.labRepo.findOne({ where: { id: labId } });
        if (!lab) {
            throw new common_1.NotFoundException('Lab not found');
        }
        let shift = null;
        if (dto.shiftId) {
            shift = await this.shiftRepo.findOne({
                where: { id: dto.shiftId, labId },
            });
            if (!shift) {
                throw new common_1.NotFoundException('Shift not found or not assigned to this lab');
            }
        }
        const testIds = dto.samples.flatMap((s) => s.tests.map((t) => t.testId));
        const uniqueTestIds = [...new Set(testIds)];
        const tests = await this.testRepo.find({
            where: uniqueTestIds.map((id) => ({ id, labId })),
        });
        if (tests.length !== uniqueTestIds.length) {
            throw new common_1.NotFoundException('One or more tests not found');
        }
        const testMap = new Map(tests.map((t) => [t.id, t]));
        const patientType = dto.patientType || order_entity_1.PatientType.WALK_IN;
        const precomputedPricingMap = await this.resolvePricingForTests(labId, uniqueTestIds, dto.shiftId || null, patientType);
        const totalAmount = uniqueTestIds.reduce((sum, testId) => sum + (precomputedPricingMap.get(testId) ?? 0), 0);
        const discountPercent = Math.min(100, Math.max(0, dto.discountPercent ?? 0));
        const finalAmount = Math.round(totalAmount * (1 - discountPercent / 100) * 100) / 100;
        const labelSequenceBy = lab.labelSequenceBy === 'department' ? 'department' : 'tube_type';
        const sequenceResetBy = lab.sequenceResetBy === 'shift' ? 'shift' : 'day';
        const effectiveShiftId = sequenceResetBy === 'shift' ? dto.shiftId || null : null;
        const samplesToCreate = labelSequenceBy === 'department'
            ? this.splitSamplesForDepartmentLabels(dto.samples, testMap)
            : dto.samples;
        return this.orderRepo.manager.transaction(async (manager) => {
            const orderRepo = manager.getRepository(order_entity_1.Order);
            const sampleRepo = manager.getRepository(sample_entity_1.Sample);
            const now = new Date();
            const labTimeZone = (0, lab_timezone_util_1.normalizeLabTimeZone)(lab.timezone);
            const counterDateKey = (0, lab_timezone_util_1.formatDateKeyForTimeZone)(now, labTimeZone);
            const orderNumber = await this.generateOrderNumber(labId, dto.shiftId || null, 1, manager, {
                now,
                timeZone: labTimeZone,
                dateKey: counterDateKey,
            });
            const order = orderRepo.create({
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
                registeredAt: new Date(),
            });
            const savedOrder = await orderRepo.save(order);
            const samplesToSave = [];
            const bulkTestData = [];
            for (let i = 0; i < samplesToCreate.length; i++) {
                const sampleDto = samplesToCreate[i];
                const sampleBarcode = orderNumber;
                const scopeKey = labelSequenceBy === 'department'
                    ? this.resolveSampleDepartmentScope(sampleDto.tests, testMap)
                    : (sampleDto.tubeType ?? null);
                const sequenceNumber = await this.getNextSequenceForScope(labId, sequenceResetBy, effectiveShiftId, scopeKey, labelSequenceBy, counterDateKey, manager);
                const sample = sampleRepo.create({
                    labId,
                    orderId: savedOrder.id,
                    sampleId: null,
                    tubeType: sampleDto.tubeType || null,
                    barcode: sampleBarcode,
                    sequenceNumber,
                    qrCode: null,
                });
                samplesToSave.push(sample);
            }
            const savedSamples = await sampleRepo.save(samplesToSave);
            for (let i = 0; i < samplesToCreate.length; i++) {
                const sampleDto = samplesToCreate[i];
                const savedSample = savedSamples[i];
                const tests = sampleDto.tests.map(t => testMap.get(t.testId)).filter(Boolean);
                bulkTestData.push({ sampleId: savedSample.id, tests });
            }
            await this.bulkCreateOrderTests(manager, labId, bulkTestData, dto.shiftId ?? null, patientType, precomputedPricingMap);
            return (await orderRepo.findOne({
                where: { id: savedOrder.id },
                relations: ['patient', 'lab', 'shift', 'samples', 'samples.orderTests', 'samples.orderTests.test'],
            }));
        });
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
        const page = Math.max(1, params.page ?? 1);
        const size = Math.min(100, Math.max(1, params.size ?? 20));
        const skip = (page - 1) * size;
        const qb = this.orderRepo
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.patient', 'patient')
            .leftJoinAndSelect('order.shift', 'shift')
            .where('order.labId = :labId', { labId });
        await this.applyOrderQueryFilters(qb, labId, params);
        qb.orderBy('order.registeredAt', 'DESC').skip(skip).take(size);
        const [orders, total] = await qb.getManyAndCount();
        await this.enrichOrdersWithProgress(orders);
        const items = orders.map((order) => {
            const testsCount = Number(order.testsCount ?? 0) || 0;
            const readyTestsCount = Number(order.readyTestsCount ?? 0) || 0;
            const reportReady = Boolean(order.reportReady) || readyTestsCount > 0;
            return {
                id: order.id,
                orderNumber: order.orderNumber,
                status: order.status,
                registeredAt: order.registeredAt,
                paymentStatus: this.normalizePaymentStatus(order.paymentStatus),
                paidAmount: order.paidAmount != null ? Number(order.paidAmount) : null,
                finalAmount: Number(order.finalAmount ?? 0),
                patient: order.patient,
                shift: order.shift ?? null,
                testsCount,
                readyTestsCount,
                reportReady,
            };
        });
        return {
            items,
            total,
            page,
            size,
            totalPages: Math.ceil(total / size),
        };
    }
    async findOne(id, labId) {
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
        return order;
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
    async updateOrderTests(id, labId, testIds) {
        const uniqueTestIds = [...new Set((testIds ?? []).map((testId) => testId?.trim()).filter(Boolean))];
        if (uniqueTestIds.length === 0) {
            throw new common_1.BadRequestException('At least one test is required');
        }
        return this.orderRepo.manager.transaction(async (manager) => {
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
            const childOrderTestsByParent = new Map();
            for (const orderTest of allOrderTests) {
                if (!orderTest.parentOrderTestId)
                    continue;
                const list = childOrderTestsByParent.get(orderTest.parentOrderTestId) ?? [];
                list.push(orderTest);
                childOrderTestsByParent.set(orderTest.parentOrderTestId, list);
            }
            const lockedRootIds = new Set();
            for (const rootOrderTest of rootOrderTests) {
                const childOrderTests = childOrderTestsByParent.get(rootOrderTest.id) ?? [];
                const isLocked = this.isOrderTestProcessed(rootOrderTest) ||
                    childOrderTests.some((childOrderTest) => this.isOrderTestProcessed(childOrderTest));
                if (isLocked) {
                    lockedRootIds.add(rootOrderTest.id);
                }
            }
            const removedLockedRoots = rootOrderTests.filter((orderTest) => lockedRootIds.has(orderTest.id) && !new Set(uniqueTestIds).has(orderTest.testId));
            if (removedLockedRoots.length > 0) {
                const labels = removedLockedRoots
                    .map((orderTest) => orderTest.test?.code || orderTest.test?.name || orderTest.testId)
                    .join(', ');
                throw new common_1.BadRequestException(`Cannot remove completed/entered tests: ${labels}. You can remove only pending tests.`);
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
            const existingRootByTestId = new Map(rootOrderTests.map((orderTest) => [orderTest.testId, orderTest]));
            const desiredSet = new Set(uniqueTestIds);
            const rootIdsToRemove = rootOrderTests
                .filter((orderTest) => !desiredSet.has(orderTest.testId) && !lockedRootIds.has(orderTest.id))
                .map((orderTest) => orderTest.id);
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
            order.status = order_entity_1.OrderStatus.REGISTERED;
            await orderRepo.update({ id: order.id, labId }, {
                totalAmount: order.totalAmount,
                finalAmount: order.finalAmount,
                status: order.status,
            });
            return (await orderRepo.findOne({
                where: { id: order.id, labId },
                relations: ['patient', 'lab', 'shift', 'samples', 'samples.orderTests', 'samples.orderTests.test'],
            }));
        });
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
        const orderTestRepo = manager.getRepository(order_test_entity_1.OrderTest);
        const allTestIds = new Set();
        for (const item of sampleWithTestsArr) {
            for (const t of item.tests) {
                allTestIds.add(t.id);
            }
        }
        const uniqueTestIds = Array.from(allTestIds);
        if (uniqueTestIds.length === 0)
            return;
        let pricingMap = precomputedPricingMap;
        if (!pricingMap) {
            pricingMap = await this.resolvePricingForTests(labId, uniqueTestIds, shiftId, patientType, manager);
        }
        const panelTestIds = uniqueTestIds.filter(id => {
            for (const item of sampleWithTestsArr) {
                if (item.tests.find(t => t.id === id)?.type === test_entity_1.TestType.PANEL)
                    return true;
            }
            return false;
        });
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
        const toSave = [];
        for (const { sampleId, tests } of sampleWithTestsArr) {
            for (const test of tests) {
                const price = pricingMap.get(test.id) ?? 0;
                if (test.type === test_entity_1.TestType.PANEL) {
                    const parentId = require('crypto').randomUUID();
                    toSave.push(orderTestRepo.create({
                        id: parentId,
                        labId,
                        sampleId,
                        testId: test.id,
                        parentOrderTestId: null,
                        status: order_test_entity_1.OrderTestStatus.PENDING,
                        price,
                    }));
                    const components = componentsByPanelId.get(test.id) ?? [];
                    for (const comp of components) {
                        toSave.push(orderTestRepo.create({
                            labId,
                            sampleId,
                            testId: comp.childTestId,
                            parentOrderTestId: parentId,
                            status: order_test_entity_1.OrderTestStatus.PENDING,
                            price: null,
                            panelSortOrder: comp.sortOrder ?? null,
                        }));
                    }
                }
                else {
                    toSave.push(orderTestRepo.create({
                        labId,
                        sampleId,
                        testId: test.id,
                        parentOrderTestId: null,
                        status: order_test_entity_1.OrderTestStatus.PENDING,
                        price,
                    }));
                }
            }
        }
        if (toSave.length > 0) {
            await orderTestRepo.save(toSave);
        }
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
    isOrderTestProcessed(orderTest) {
        return (orderTest.status !== order_test_entity_1.OrderTestStatus.PENDING ||
            orderTest.resultValue !== null ||
            (orderTest.resultText?.trim()?.length ?? 0) > 0 ||
            (orderTest.resultParameters != null && Object.keys(orderTest.resultParameters).length > 0) ||
            orderTest.resultedAt !== null ||
            orderTest.verifiedAt !== null);
    }
    getPricingPriority(pricing, shiftId, patientType) {
        const matchesShift = pricing.shiftId === shiftId;
        const isDefaultShift = pricing.shiftId === null;
        const matchesPatientType = pricing.patientType === patientType;
        const isDefaultPatientType = pricing.patientType === null;
        if (shiftId) {
            if (matchesShift && matchesPatientType)
                return 0;
            if (matchesShift && isDefaultPatientType)
                return 1;
            if (isDefaultShift && matchesPatientType)
                return 2;
            if (isDefaultShift && isDefaultPatientType)
                return 3;
        }
        else {
            if (isDefaultShift && matchesPatientType)
                return 0;
            if (isDefaultShift && isDefaultPatientType)
                return 1;
        }
        return 100 + (isDefaultShift ? 0 : 10) + (isDefaultPatientType ? 0 : 1);
    }
    selectBestPricing(candidates, shiftId, patientType) {
        let best = null;
        let bestScore = Number.POSITIVE_INFINITY;
        for (const pricing of candidates) {
            const score = this.getPricingPriority(pricing, shiftId, patientType);
            if (score < bestScore) {
                best = pricing;
                bestScore = score;
                continue;
            }
            if (score !== bestScore || !best) {
                continue;
            }
            const bestUpdated = best.updatedAt?.getTime?.() ?? 0;
            const currentUpdated = pricing.updatedAt?.getTime?.() ?? 0;
            if (currentUpdated > bestUpdated) {
                best = pricing;
            }
        }
        return best;
    }
    async resolvePricingForTests(labId, testIds, shiftId, patientType, manager = this.orderRepo.manager) {
        const uniqueTestIds = [...new Set((testIds ?? []).filter(Boolean))];
        const pricingMap = new Map();
        if (uniqueTestIds.length === 0) {
            return pricingMap;
        }
        const rows = await manager
            .getRepository(pricing_entity_1.Pricing)
            .createQueryBuilder('pricing')
            .where('pricing.labId = :labId', { labId })
            .andWhere('pricing.testId IN (:...testIds)', { testIds: uniqueTestIds })
            .andWhere('pricing.isActive = :isActive', { isActive: true })
            .getMany();
        const rowsByTestId = new Map();
        for (const row of rows) {
            const current = rowsByTestId.get(row.testId) ?? [];
            current.push(row);
            rowsByTestId.set(row.testId, current);
        }
        for (const testId of uniqueTestIds) {
            const selected = this.selectBestPricing(rowsByTestId.get(testId) ?? [], shiftId, patientType);
            const numericPrice = selected ? Number(selected.price) : 0;
            pricingMap.set(testId, Number.isFinite(numericPrice) ? numericPrice : 0);
        }
        return pricingMap;
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
        const rangeStart = `${datePrefix}000`;
        const rangeEnd = `${datePrefix}999`;
        const rows = await manager.query(`
        SELECT COALESCE(MAX(CAST(RIGHT("orderNumber", 3) AS integer)), 0) AS "maxSeq"
        FROM "orders"
        WHERE "labId" = $1
          AND "orderNumber" BETWEEN $2 AND $3
          AND CHAR_LENGTH("orderNumber") = 9
      `, [labId, rangeStart, rangeEnd]);
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
        const pricingMap = await this.resolvePricingForTests(labId, uniqueTestIds, shiftId, patientType);
        const subtotal = uniqueTestIds.reduce((sum, testId) => sum + (pricingMap.get(testId) ?? 0), 0);
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
                qb.andWhere(`("order"."status" = :status OR EXISTS (
            SELECT 1
            FROM samples s
            INNER JOIN order_tests ot ON ot."sampleId" = s.id
            WHERE s."orderId" = "order"."id"
              AND ot.status IN (:...completedStatuses)
          ))`, {
                    status: params.status,
                    completedStatuses: [
                        order_test_entity_1.OrderTestStatus.COMPLETED,
                        order_test_entity_1.OrderTestStatus.VERIFIED,
                        order_test_entity_1.OrderTestStatus.REJECTED,
                    ],
                });
            }
            else {
                qb.andWhere('order.status = :status', { status: params.status });
            }
        }
        if (params.patientId) {
            qb.andWhere('order.patientId = :patientId', { patientId: params.patientId });
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
    }
    async enrichOrdersWithProgress(items) {
        if (items.length === 0) {
            return;
        }
        const orderIds = items.map((order) => order.id);
        const progressed = await this.orderRepo.manager
            .createQueryBuilder()
            .select('s."orderId"', 'orderId')
            .addSelect('COUNT(*)', 'cnt')
            .from('order_tests', 'ot')
            .innerJoin('samples', 's', 's.id = ot."sampleId"')
            .where('s."orderId" IN (:...orderIds)', { orderIds })
            .andWhere('ot.status IN (:...statuses)', {
            statuses: [
                order_test_entity_1.OrderTestStatus.COMPLETED,
                order_test_entity_1.OrderTestStatus.VERIFIED,
                order_test_entity_1.OrderTestStatus.REJECTED,
            ],
        })
            .groupBy('s."orderId"')
            .getRawMany();
        const progressedSet = new Set(progressed.map((row) => row.orderId));
        const testCounts = await this.orderRepo.manager
            .createQueryBuilder()
            .select('s."orderId"', 'orderId')
            .addSelect('COUNT(*) FILTER (WHERE ot."parentOrderTestId" IS NULL)', 'totalTests')
            .addSelect(`SUM(CASE WHEN ot.status IN (:...readyStatuses) AND ot."parentOrderTestId" IS NULL THEN 1 ELSE 0 END)`, 'readyTests')
            .from('order_tests', 'ot')
            .innerJoin('samples', 's', 's.id = ot."sampleId"')
            .where('s."orderId" IN (:...orderIds)', { orderIds })
            .setParameter('readyStatuses', [
            order_test_entity_1.OrderTestStatus.COMPLETED,
            order_test_entity_1.OrderTestStatus.VERIFIED,
            order_test_entity_1.OrderTestStatus.REJECTED,
        ])
            .groupBy('s."orderId"')
            .getRawMany();
        const countMap = new Map(testCounts.map((row) => [
            row.orderId,
            {
                totalTests: parseInt(row.totalTests, 10) || 0,
                readyTests: parseInt(row.readyTests, 10) || 0,
            },
        ]));
        for (const order of items) {
            const counts = countMap.get(order.id) || { totalTests: 0, readyTests: 0 };
            order.testsCount = counts.totalTests;
            order.readyTestsCount = counts.readyTests;
            order.reportReady = counts.readyTests > 0;
            if (order.status !== order_entity_1.OrderStatus.CANCELLED && progressedSet.has(order.id)) {
                order.status = order_entity_1.OrderStatus.COMPLETED;
            }
        }
    }
    normalizePaymentStatus(value) {
        if (value === 'paid')
            return 'paid';
        if (value === 'partial')
            return 'partial';
        return 'unpaid';
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
exports.OrdersService = OrdersService = __decorate([
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
        typeorm_2.Repository])
], OrdersService);
//# sourceMappingURL=orders.service.js.map