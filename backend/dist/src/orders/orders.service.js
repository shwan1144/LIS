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
        let totalAmount = 0;
        for (const testId of uniqueTestIds) {
            const pricing = await this.findPricing(labId, testId, dto.shiftId || null, patientType);
            totalAmount += pricing;
        }
        const discountPercent = Math.min(100, Math.max(0, dto.discountPercent ?? 0));
        const finalAmount = Math.round(totalAmount * (1 - discountPercent / 100) * 100) / 100;
        const labelSequenceBy = lab.labelSequenceBy === 'department' ? 'department' : 'tube_type';
        const sequenceResetBy = lab.sequenceResetBy === 'shift' ? 'shift' : 'day';
        const effectiveShiftId = sequenceResetBy === 'shift' ? dto.shiftId || null : null;
        const samplesToCreate = labelSequenceBy === 'department'
            ? this.splitSamplesForDepartmentLabels(dto.samples, testMap)
            : dto.samples;
        const orderNumber = await this.generateOrderNumber(labId, dto.shiftId || null);
        const order = this.orderRepo.create({
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
        const savedOrder = await this.orderRepo.save(order);
        const datePart = orderNumber.slice(0, 6);
        let seq = parseInt(orderNumber.slice(-3), 10);
        for (let i = 0; i < samplesToCreate.length; i++) {
            const sampleDto = samplesToCreate[i];
            const sampleBarcode = `${datePart}${String(seq + i).padStart(3, '0')}`;
            const scopeKey = labelSequenceBy === 'department'
                ? this.resolveSampleDepartmentScope(sampleDto.tests, testMap)
                : (sampleDto.tubeType ?? null);
            const sequenceNumber = await this.getNextSequenceForScope(labId, sequenceResetBy, effectiveShiftId, scopeKey, labelSequenceBy);
            const sample = this.orderRepo.manager.create(sample_entity_1.Sample, {
                labId,
                orderId: savedOrder.id,
                sampleId: sampleDto.sampleId || null,
                tubeType: sampleDto.tubeType || null,
                barcode: sampleBarcode,
                sequenceNumber,
                qrCode: null,
            });
            const savedSample = await this.orderRepo.manager.save(sample);
            for (const testDto of sampleDto.tests) {
                const test = testMap.get(testDto.testId);
                if (!test) {
                    continue;
                }
                await this.createOrderTestsForSample(this.orderRepo.manager, labId, savedSample.id, test, dto.shiftId ?? null, patientType);
            }
        }
        return this.orderRepo.findOne({
            where: { id: savedOrder.id },
            relations: ['patient', 'lab', 'shift', 'samples', 'samples.orderTests', 'samples.orderTests.test'],
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
        if (params.startDate && params.endDate) {
            const startDate = new Date(params.startDate);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(params.endDate);
            endDate.setHours(23, 59, 59, 999);
            qb.andWhere('order.registeredAt BETWEEN :startDate AND :endDate', {
                startDate,
                endDate,
            });
        }
        else if (params.startDate) {
            const startDate = new Date(params.startDate);
            startDate.setHours(0, 0, 0, 0);
            qb.andWhere('order.registeredAt >= :startDate', { startDate });
        }
        else if (params.endDate) {
            const endDate = new Date(params.endDate);
            endDate.setHours(23, 59, 59, 999);
            qb.andWhere('order.registeredAt <= :endDate', { endDate });
        }
        qb.orderBy('order.registeredAt', 'DESC').skip(skip).take(size);
        const [items, total] = await qb.getManyAndCount();
        if (items.length > 0) {
            const orderIds = items.map((o) => o.id);
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
            const progressedSet = new Set(progressed.map((r) => r.orderId));
            const testCounts = await this.orderRepo.manager
                .createQueryBuilder()
                .select('s."orderId"', 'orderId')
                .addSelect('COUNT(*)', 'totalTests')
                .addSelect(`SUM(CASE WHEN ot.status IN (:...readyStatuses) THEN 1 ELSE 0 END)`, 'readyTests')
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
            const countMap = new Map(testCounts.map((r) => [
                r.orderId,
                {
                    totalTests: parseInt(r.totalTests, 10) || 0,
                    readyTests: parseInt(r.readyTests, 10) || 0,
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
            const sampleByScope = new Map();
            for (const sample of refreshedSamples) {
                const departmentIds = Array.from(new Set((sample.orderTests ?? []).map((orderTest) => orderTest.test?.departmentId ?? null)));
                const sampleDepartmentId = departmentIds.length === 1 ? departmentIds[0] : null;
                const scopeMapKey = this.buildSampleGroupingKey(labelSequenceBy, sample.tubeType ?? null, sampleDepartmentId);
                if (!sampleByScope.has(scopeMapKey)) {
                    sampleByScope.set(scopeMapKey, sample);
                }
            }
            const nextBarcode = this.createOrderSampleBarcodeAllocator(order.orderNumber, refreshedSamples.map((sample) => sample.barcode));
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
                    const sequenceNumber = await this.getNextSequenceForScope(labId, sequenceResetBy, effectiveShiftId, scopeKey, labelSequenceBy);
                    const createdSample = sampleRepo.create({
                        labId,
                        orderId: order.id,
                        sampleId: null,
                        tubeType: testTubeType,
                        barcode: nextBarcode(),
                        sequenceNumber,
                        qrCode: null,
                    });
                    targetSample = await sampleRepo.save(createdSample);
                    sampleByScope.set(sampleScopeKey, targetSample);
                }
                await this.createOrderTestsForSample(manager, labId, targetSample.id, test, order.shiftId ?? null, order.patientType);
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
                        sampleId: sample.sampleId ?? undefined,
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
    async createOrderTestsForSample(manager, labId, sampleId, test, shiftId, patientType) {
        const orderTestRepo = manager.getRepository(order_test_entity_1.OrderTest);
        const panelPrice = await this.findPricing(labId, test.id, shiftId, patientType);
        if (test.type === test_entity_1.TestType.PANEL) {
            const parentOrderTest = orderTestRepo.create({
                labId,
                sampleId,
                testId: test.id,
                parentOrderTestId: null,
                status: order_test_entity_1.OrderTestStatus.PENDING,
                price: panelPrice,
            });
            const savedParent = await orderTestRepo.save(parentOrderTest);
            const components = await manager.getRepository(test_component_entity_1.TestComponent)
                .createQueryBuilder('component')
                .innerJoinAndSelect('component.childTest', 'childTest')
                .where('component.panelTestId = :panelTestId', { panelTestId: test.id })
                .andWhere('childTest.labId = :labId', { labId })
                .orderBy('component.sortOrder', 'ASC')
                .getMany();
            for (const component of components) {
                const childOrderTest = orderTestRepo.create({
                    labId,
                    sampleId,
                    testId: component.childTestId,
                    parentOrderTestId: savedParent.id,
                    status: order_test_entity_1.OrderTestStatus.PENDING,
                    price: null,
                });
                await orderTestRepo.save(childOrderTest);
            }
            return;
        }
        const orderTest = orderTestRepo.create({
            labId,
            sampleId,
            testId: test.id,
            parentOrderTestId: null,
            status: order_test_entity_1.OrderTestStatus.PENDING,
            price: panelPrice,
        });
        await orderTestRepo.save(orderTest);
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
    async findPricing(labId, testId, shiftId, patientType) {
        const qb = this.pricingRepo.createQueryBuilder('pricing')
            .where('pricing.labId = :labId', { labId })
            .andWhere('pricing.testId = :testId', { testId })
            .andWhere('pricing.isActive = :isActive', { isActive: true });
        if (shiftId) {
            qb.andWhere('(pricing.shiftId = :shiftId AND pricing.patientType = :patientType) OR ' +
                '(pricing.shiftId = :shiftId AND pricing.patientType IS NULL) OR ' +
                '(pricing.shiftId IS NULL AND pricing.patientType = :patientType) OR ' +
                '(pricing.shiftId IS NULL AND pricing.patientType IS NULL)', { shiftId, patientType });
        }
        else {
            qb.andWhere('(pricing.shiftId IS NULL AND pricing.patientType = :patientType) OR ' +
                '(pricing.shiftId IS NULL AND pricing.patientType IS NULL)', { patientType });
        }
        qb.orderBy('pricing.shiftId', 'ASC')
            .addOrderBy('pricing.patientType', 'ASC')
            .limit(1);
        let pricing = await qb.getOne();
        if (!pricing) {
            const fallback = await this.pricingRepo.findOne({
                where: { labId, testId, isActive: true },
                order: { shiftId: 'ASC' },
            });
            pricing = fallback ?? null;
        }
        if (!pricing) {
            return 0;
        }
        return parseFloat(pricing.price.toString());
    }
    async getNextOrderNumber(labId, shiftId) {
        return this.computeNextOrderNumber(labId, shiftId);
    }
    async generateOrderNumber(labId, shiftId) {
        return this.computeNextOrderNumber(labId, shiftId);
    }
    async computeNextOrderNumber(labId, shiftId) {
        const today = new Date();
        const yy = String(today.getFullYear() % 100).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const dateStr = `${yy}${mm}${dd}`;
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);
        const qb = this.orderRepo.manager
            .createQueryBuilder()
            .select('COUNT(sample.id)', 'count')
            .from(sample_entity_1.Sample, 'sample')
            .innerJoin('sample.order', 'order')
            .where('order.labId = :labId', { labId })
            .andWhere('order.registeredAt BETWEEN :startOfDay AND :endOfDay', {
            startOfDay,
            endOfDay,
        });
        if (shiftId == null) {
            qb.andWhere('order.shiftId IS NULL');
        }
        else {
            qb.andWhere('order.shiftId = :shiftId', { shiftId });
        }
        const result = await qb.getRawOne();
        const count = Number(result?.count ?? 0) | 0;
        const sequence = String(count + 1).padStart(3, '0');
        return `${dateStr}${sequence}`;
    }
    async getNextSequenceForScope(labId, sequenceResetBy, shiftId, scopeKey, labelSequenceBy) {
        const today = new Date();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);
        const applyShiftFilter = (qb) => {
            if (sequenceResetBy !== 'shift')
                return;
            if (shiftId == null) {
                qb.andWhere('order.shiftId IS NULL');
            }
            else {
                qb.andWhere('order.shiftId = :shiftId', { shiftId });
            }
        };
        if (labelSequenceBy === 'tube_type') {
            const qb = this.orderRepo.manager
                .createQueryBuilder()
                .select('COUNT(sample.id)', 'count')
                .from(sample_entity_1.Sample, 'sample')
                .innerJoin('sample.order', 'order')
                .where('order.labId = :labId', { labId })
                .andWhere('order.registeredAt BETWEEN :startOfDay AND :endOfDay', {
                startOfDay,
                endOfDay,
            });
            applyShiftFilter(qb);
            if (scopeKey == null) {
                qb.andWhere('sample.tubeType IS NULL');
            }
            else {
                qb.andWhere('sample.tubeType = :scopeKey', { scopeKey });
            }
            const result = await qb.getRawOne();
            const count = Number(result?.count ?? 0) | 0;
            return count + 1;
        }
        const qb = this.orderRepo.manager
            .createQueryBuilder()
            .select('COUNT(DISTINCT sample.id)', 'count')
            .from(sample_entity_1.Sample, 'sample')
            .innerJoin('sample.order', 'order')
            .innerJoin('sample.orderTests', 'ot')
            .innerJoin('ot.test', 'test')
            .where('order.labId = :labId', { labId })
            .andWhere('order.registeredAt BETWEEN :startOfDay AND :endOfDay', {
            startOfDay,
            endOfDay,
        });
        applyShiftFilter(qb);
        if (scopeKey == null) {
            qb.andWhere('test.departmentId IS NULL');
        }
        else {
            qb.andWhere('test.departmentId = :scopeKey', { scopeKey });
        }
        const result = await qb.getRawOne();
        const count = Number(result?.count ?? 0) | 0;
        return count + 1;
    }
    async estimatePrice(labId, testIds, shiftId = null) {
        if (!testIds?.length)
            return { subtotal: 0 };
        const uniqueTestIds = [...new Set(testIds)];
        let subtotal = 0;
        const patientType = order_entity_1.PatientType.WALK_IN;
        for (const testId of uniqueTestIds) {
            const price = await this.findPricing(labId, testId, shiftId, patientType);
            subtotal += price;
        }
        return { subtotal };
    }
    async getOrdersTodayCount(labId) {
        const today = new Date();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);
        return this.orderRepo.count({
            where: {
                labId,
                registeredAt: (0, typeorm_2.Between)(startOfDay, endOfDay),
            },
        });
    }
    async getTodayPatients(labId) {
        const today = new Date();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);
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
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - days + 1);
        startDate.setHours(0, 0, 0, 0);
        const orders = await this.orderRepo
            .createQueryBuilder('order')
            .select("DATE(order.registeredAt)", "date")
            .addSelect("COUNT(*)", "count")
            .where('order.labId = :labId', { labId })
            .andWhere('order.registeredAt BETWEEN :startDate AND :endDate', {
            startDate,
            endDate,
        })
            .groupBy("DATE(order.registeredAt)")
            .orderBy("DATE(order.registeredAt)", "ASC")
            .getRawMany();
        const resultMap = new Map();
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().slice(0, 10);
            resultMap.set(dateStr, 0);
            currentDate.setDate(currentDate.getDate() + 1);
        }
        orders.forEach((row) => {
            const dateStr = row.date instanceof Date
                ? row.date.toISOString().slice(0, 10)
                : row.date.slice(0, 10);
            resultMap.set(dateStr, parseInt(row.count, 10));
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
        const existing = await this.worklistRepo.findOne({ where: { labId, shiftId: shiftKey } });
        if (existing) {
            await this.worklistRepo.update({ labId, shiftId: shiftKey }, { itemsJson });
            return;
        }
        try {
            await this.worklistRepo.insert({ labId, shiftId: shiftKey, itemsJson });
        }
        catch (err) {
            const code = err?.code;
            if (code === '23505') {
                await this.worklistRepo.update({ labId }, { shiftId: shiftKey, itemsJson });
            }
            else {
                throw err;
            }
        }
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