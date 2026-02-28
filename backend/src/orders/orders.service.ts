import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, EntityManager, SelectQueryBuilder } from 'typeorm';
import { Order, OrderStatus, PatientType } from '../entities/order.entity';
import { Sample, TubeType as SampleTubeType } from '../entities/sample.entity';
import { OrderTest, OrderTestStatus } from '../entities/order-test.entity';
import { Patient } from '../entities/patient.entity';
import { Lab } from '../entities/lab.entity';
import { Shift } from '../entities/shift.entity';
import { Test, TestType } from '../entities/test.entity';
import { Pricing } from '../entities/pricing.entity';
import { TestComponent } from '../entities/test-component.entity';
import { LabOrdersWorklist } from '../entities/lab-orders-worklist.entity';
import { CreateOrderDto, CreateSampleDto } from './dto/create-order.dto';
import {
  nextLabCounterValue,
  nextLabCounterValueWithFloor,
  peekNextLabCounterValue,
} from '../database/lab-counter.util';
import {
  addDaysToDateKey,
  formatDateKeyForTimeZone,
  formatOrderDatePrefixForTimeZone,
  getUtcRangeForLabDate,
  normalizeLabTimeZone,
} from '../database/lab-timezone.util';

export interface WorklistItemStored {
  rowId: string;
  patientId: string;
  orderId?: string;
}

export interface WorklistItemResponse {
  rowId: string;
  patient: Patient;
  createdOrder: Order | null;
}

export interface OrderListQueryParams {
  page?: number;
  size?: number;
  search?: string;
  status?: OrderStatus;
  patientId?: string;
  startDate?: string;
  endDate?: string;
}

export interface OrderHistoryItem {
  id: string;
  orderNumber: string | null;
  status: OrderStatus;
  registeredAt: Date;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  paidAmount: number | null;
  finalAmount: number;
  patient: Patient;
  shift: Shift | null;
  testsCount: number;
  readyTestsCount: number;
  reportReady: boolean;
}

type OrderProgressTarget = {
  id: string;
  status: OrderStatus;
  testsCount?: number;
  readyTestsCount?: number;
  reportReady?: boolean;
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(Lab)
    private readonly labRepo: Repository<Lab>,
    @InjectRepository(Shift)
    private readonly shiftRepo: Repository<Shift>,
    @InjectRepository(Test)
    private readonly testRepo: Repository<Test>,
    @InjectRepository(Pricing)
    private readonly pricingRepo: Repository<Pricing>,
    @InjectRepository(TestComponent)
    private readonly testComponentRepo: Repository<TestComponent>,
    @InjectRepository(LabOrdersWorklist)
    private readonly worklistRepo: Repository<LabOrdersWorklist>,
  ) { }

  async create(labId: string, dto: CreateOrderDto): Promise<Order> {
    // Validate patient exists
    const patient = await this.patientRepo.findOne({
      where: { id: dto.patientId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    // Validate lab exists
    const lab = await this.labRepo.findOne({ where: { id: labId } });
    if (!lab) {
      throw new NotFoundException('Lab not found');
    }

    // Validate shift if provided
    let shift: Shift | null = null;
    if (dto.shiftId) {
      shift = await this.shiftRepo.findOne({
        where: { id: dto.shiftId, labId },
      });
      if (!shift) {
        throw new NotFoundException('Shift not found or not assigned to this lab');
      }
    }

    // Validate tests exist
    const testIds = dto.samples.flatMap((s) => s.tests.map((t) => t.testId));
    const uniqueTestIds = [...new Set(testIds)];
    const tests = await this.testRepo.find({
      where: uniqueTestIds.map((id) => ({ id, labId })),
    });
    if (tests.length !== uniqueTestIds.length) {
      throw new NotFoundException('One or more tests not found');
    }
    const testMap = new Map<string, Test>(tests.map((t) => [t.id, t]));

    // Calculate pricing
    const patientType = dto.patientType || PatientType.WALK_IN;
    const precomputedPricingMap = await this.resolvePricingForTests(
      labId,
      uniqueTestIds,
      dto.shiftId || null,
      patientType,
    );
    const totalAmount = uniqueTestIds.reduce(
      (sum, testId) => sum + (precomputedPricingMap.get(testId) ?? 0),
      0,
    );

    const discountPercent = Math.min(100, Math.max(0, dto.discountPercent ?? 0));
    const finalAmount = Math.round(totalAmount * (1 - discountPercent / 100) * 100) / 100;

    const labelSequenceBy = lab.labelSequenceBy === 'department' ? 'department' : 'tube_type';
    const sequenceResetBy = lab.sequenceResetBy === 'shift' ? 'shift' : 'day';
    const effectiveShiftId =
      sequenceResetBy === 'shift' ? dto.shiftId || null : null;
    const samplesToCreate =
      labelSequenceBy === 'department'
        ? this.splitSamplesForDepartmentLabels(dto.samples, testMap)
        : dto.samples;

    return this.orderRepo.manager.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const sampleRepo = manager.getRepository(Sample);
      const now = new Date();
      const labTimeZone = normalizeLabTimeZone(lab.timezone);
      const counterDateKey = formatDateKeyForTimeZone(now, labTimeZone);

      // Generate order number once per order (sequential per lab, per day).
      const orderNumber = await this.generateOrderNumber(
        labId,
        dto.shiftId || null,
        1,
        manager,
        {
          now,
          timeZone: labTimeZone,
          dateKey: counterDateKey,
        },
      );

      // Create order
      const order = orderRepo.create({
        patientId: dto.patientId,
        labId,
        shiftId: dto.shiftId || null,
        orderNumber,
        status: OrderStatus.REGISTERED,
        patientType,
        notes: dto.notes || null,
        totalAmount,
        discountPercent,
        finalAmount,
        registeredAt: new Date(),
      });

      const savedOrder = await orderRepo.save(order);

      // Create samples and order tests.
      // Barcode is order-level and reused across all tubes/samples in the order.
      const samplesToSave = [];
      const bulkTestData = [];

      for (let i = 0; i < samplesToCreate.length; i++) {
        const sampleDto = samplesToCreate[i];
        const sampleBarcode = orderNumber;
        const scopeKey =
          labelSequenceBy === 'department'
            ? this.resolveSampleDepartmentScope(sampleDto.tests, testMap)
            : (sampleDto.tubeType ?? null);
        const sequenceNumber = await this.getNextSequenceForScope(
          labId,
          sequenceResetBy,
          effectiveShiftId,
          scopeKey,
          labelSequenceBy,
          counterDateKey,
          manager,
        );
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
        const tests = sampleDto.tests.map(t => testMap.get(t.testId)!).filter(Boolean);
        bulkTestData.push({ sampleId: savedSample.id, tests });
      }

      await this.bulkCreateOrderTests(
        manager,
        labId,
        bulkTestData,
        dto.shiftId ?? null,
        patientType,
        precomputedPricingMap,
      );

      // Reload order with relations
      return (await orderRepo.findOne({
        where: { id: savedOrder.id },
        relations: ['patient', 'lab', 'shift', 'samples', 'samples.orderTests', 'samples.orderTests.test'],
      })) as Order;
    });
  }

  async findAll(labId: string, params: OrderListQueryParams) {
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
    await this.enrichOrdersWithProgress(items as OrderProgressTarget[]);

    return {
      items,
      total,
      page,
      size,
      totalPages: Math.ceil(total / size),
    };
  }

  async findHistory(labId: string, params: OrderListQueryParams): Promise<{
    items: OrderHistoryItem[];
    total: number;
    page: number;
    size: number;
    totalPages: number;
  }> {
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
    await this.enrichOrdersWithProgress(orders as OrderProgressTarget[]);

    const items: OrderHistoryItem[] = orders.map((order) => {
      const testsCount = Number((order as unknown as Record<string, unknown>).testsCount ?? 0) || 0;
      const readyTestsCount =
        Number((order as unknown as Record<string, unknown>).readyTestsCount ?? 0) || 0;
      const reportReady =
        Boolean((order as unknown as Record<string, unknown>).reportReady) || readyTestsCount > 0;

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

  async findOne(id: string, labId: string): Promise<Order> {
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
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async updatePayment(
    id: string,
    labId: string,
    data: { paymentStatus: 'unpaid' | 'partial' | 'paid'; paidAmount?: number },
  ): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id, labId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    order.paymentStatus = data.paymentStatus;
    if (data.paidAmount !== undefined) {
      order.paidAmount = data.paidAmount;
    } else if (data.paymentStatus === 'paid') {
      order.paidAmount = Number(order.finalAmount);
    } else if (data.paymentStatus === 'unpaid') {
      order.paidAmount = null;
    }
    await this.orderRepo.save(order);
    return this.findOne(id, labId);
  }

  async updateDiscount(id: string, labId: string, discountPercent: number): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id, labId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cancelled order cannot be edited');
    }

    const normalizedDiscount = Math.min(100, Math.max(0, Number(discountPercent ?? 0)));
    const totalAmount = Math.round(Number(order.totalAmount ?? 0) * 100) / 100;
    const finalAmount = Math.round(totalAmount * (1 - normalizedDiscount / 100) * 100) / 100;

    const normalizedPaymentStatus = this.normalizePaymentStatus(order.paymentStatus);
    const nextPaidAmount =
      normalizedPaymentStatus === 'paid'
        ? finalAmount
        : normalizedPaymentStatus === 'partial' && order.paidAmount != null
          ? Math.min(Number(order.paidAmount), finalAmount)
          : order.paidAmount;

    await this.orderRepo.update(
      { id, labId },
      {
        discountPercent: normalizedDiscount,
        finalAmount,
        paidAmount: nextPaidAmount,
      },
    );

    return this.findOne(id, labId);
  }

  async updateOrderTests(
    id: string,
    labId: string,
    testIds: string[],
  ): Promise<Order> {
    const uniqueTestIds = [...new Set((testIds ?? []).map((testId) => testId?.trim()).filter(Boolean))];
    if (uniqueTestIds.length === 0) {
      throw new BadRequestException('At least one test is required');
    }

    return this.orderRepo.manager.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const sampleRepo = manager.getRepository(Sample);
      const orderTestRepo = manager.getRepository(OrderTest);
      const testRepo = manager.getRepository(Test);

      const order = await orderRepo.findOne({
        where: { id, labId },
        relations: ['samples', 'samples.orderTests', 'samples.orderTests.test', 'lab'],
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (order.status === OrderStatus.CANCELLED) {
        throw new BadRequestException('Cancelled order cannot be edited');
      }

      const allOrderTests = order.samples.flatMap((sample) => sample.orderTests ?? []);
      const rootOrderTests = allOrderTests.filter((orderTest) => !orderTest.parentOrderTestId);
      const existingRootTestIdSet = new Set(rootOrderTests.map((orderTest) => orderTest.testId));
      const childOrderTestsByParent = new Map<string, OrderTest[]>();
      for (const orderTest of allOrderTests) {
        if (!orderTest.parentOrderTestId) continue;
        const list = childOrderTestsByParent.get(orderTest.parentOrderTestId) ?? [];
        list.push(orderTest);
        childOrderTestsByParent.set(orderTest.parentOrderTestId, list);
      }

      const lockedRootIds = new Set<string>();
      for (const rootOrderTest of rootOrderTests) {
        const childOrderTests = childOrderTestsByParent.get(rootOrderTest.id) ?? [];
        const isLocked =
          this.isOrderTestProcessed(rootOrderTest) ||
          childOrderTests.some((childOrderTest) => this.isOrderTestProcessed(childOrderTest));
        if (isLocked) {
          lockedRootIds.add(rootOrderTest.id);
        }
      }

      const removedLockedRoots = rootOrderTests.filter(
        (orderTest) => lockedRootIds.has(orderTest.id) && !new Set(uniqueTestIds).has(orderTest.testId),
      );
      if (removedLockedRoots.length > 0) {
        const labels = removedLockedRoots
          .map((orderTest) => orderTest.test?.code || orderTest.test?.name || orderTest.testId)
          .join(', ');
        throw new BadRequestException(
          `Cannot remove completed/entered tests: ${labels}. You can remove only pending tests.`,
        );
      }

      const tests = await testRepo.find({
        where: uniqueTestIds.map((testId) => ({ id: testId, labId })),
      });
      if (tests.length !== uniqueTestIds.length) {
        throw new NotFoundException('One or more selected tests not found');
      }
      const inactiveNewTests = tests.filter(
        (test) => !test.isActive && !existingRootTestIdSet.has(test.id),
      );
      if (inactiveNewTests.length > 0) {
        throw new BadRequestException('Cannot add inactive tests to an existing order');
      }
      const testMap = new Map<string, Test>(tests.map((test) => [test.id, test]));

      const existingRootByTestId = new Map(
        rootOrderTests.map((orderTest) => [orderTest.testId, orderTest]),
      );
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
      const counterDateKey = formatDateKeyForTimeZone(
        new Date(),
        normalizeLabTimeZone(order.lab?.timezone),
      );
      const sampleByScope = new Map<string, Sample>();
      for (const sample of refreshedSamples) {
        const departmentIds = Array.from(
          new Set((sample.orderTests ?? []).map((orderTest) => orderTest.test?.departmentId ?? null)),
        );
        const sampleDepartmentId = departmentIds.length === 1 ? departmentIds[0] : null;
        const scopeMapKey = this.buildSampleGroupingKey(
          labelSequenceBy,
          (sample.tubeType as SampleTubeType | null) ?? null,
          sampleDepartmentId,
        );
        if (!sampleByScope.has(scopeMapKey)) {
          sampleByScope.set(scopeMapKey, sample);
        }
      }

      // `createOrderSampleBarcodeAllocator` removed, we will grab global sequence directly
      const bulkTestsBySample = new Map<string, Test[]>();

      for (const testId of uniqueTestIds) {
        if (existingRootByTestId.has(testId)) {
          continue;
        }

        const test = testMap.get(testId);
        if (!test) {
          continue;
        }

        const testTubeType = (test.tubeType as unknown as SampleTubeType) ?? null;
        const testDepartmentId = labelSequenceBy === 'department' ? test.departmentId ?? null : null;
        const sampleScopeKey = this.buildSampleGroupingKey(
          labelSequenceBy,
          testTubeType,
          testDepartmentId,
        );
        let targetSample = sampleByScope.get(sampleScopeKey);

        if (!targetSample) {
          const scopeKey =
            labelSequenceBy === 'department'
              ? (test.departmentId ?? null)
              : (test.tubeType ?? null);
          const sequenceNumber = await this.getNextSequenceForScope(
            labId,
            sequenceResetBy,
            effectiveShiftId,
            scopeKey,
            labelSequenceBy,
            counterDateKey,
            manager,
          );

          const createdSample = sampleRepo.create({
            labId,
            orderId: order.id,
            sampleId: null,
            tubeType: testTubeType,
            // Barcode stays order-level even when additional samples are created later.
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
        await this.bulkCreateOrderTests(
          manager,
          labId,
          bulkTestData,
          order.shiftId ?? null,
          order.patientType,
        );
      }

      await manager
        .createQueryBuilder()
        .delete()
        .from(Sample)
        .where(`"orderId" = :orderId`, { orderId: order.id })
        .andWhere(
          `NOT EXISTS (
            SELECT 1
            FROM "order_tests" ot
            WHERE ot."sampleId" = "samples"."id"
          )`,
        )
        .execute();

      const subtotalRow = await orderTestRepo
        .createQueryBuilder('ot')
        .innerJoin('ot.sample', 'sample')
        .select('COALESCE(SUM(ot.price), 0)', 'subtotal')
        .where('sample.orderId = :orderId', { orderId: order.id })
        .andWhere('ot.parentOrderTestId IS NULL')
        .getRawOne<{ subtotal: string }>();

      const subtotal = Number(subtotalRow?.subtotal ?? 0);
      const normalizedDiscount = Math.min(100, Math.max(0, Number(order.discountPercent ?? 0)));
      order.totalAmount = Math.round(subtotal * 100) / 100;
      order.finalAmount =
        Math.round(order.totalAmount * (1 - normalizedDiscount / 100) * 100) / 100;
      order.status = OrderStatus.REGISTERED;
      // Important: don't call save(order) here because this entity was loaded with nested
      // relations (samples/orderTests). TypeORM can try to persist stale relation graph and
      // produce invalid updates like setting order_tests.sampleId = NULL.
      await orderRepo.update(
        { id: order.id, labId },
        {
          totalAmount: order.totalAmount,
          finalAmount: order.finalAmount,
          status: order.status,
        },
      );

      return (await orderRepo.findOne({
        where: { id: order.id, labId },
        relations: ['patient', 'lab', 'shift', 'samples', 'samples.orderTests', 'samples.orderTests.test'],
      })) as Order;
    });
  }

  private splitSamplesForDepartmentLabels(
    samples: CreateSampleDto[],
    testMap: Map<string, Test>,
  ): CreateSampleDto[] {
    const groupedSamples = new Map<
      string,
      {
        tubeType?: SampleTubeType;
        tests: Array<{ testId: string }>;
      }
    >();

    for (const sample of samples) {
      for (const selectedTest of sample.tests ?? []) {
        const test = testMap.get(selectedTest.testId);
        if (!test) continue;

        const departmentId = test.departmentId ?? '__none__';
        const tubeType = ((test.tubeType as unknown as SampleTubeType) ?? sample.tubeType ?? null);
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

  private resolveSampleDepartmentScope(
    tests: CreateSampleDto['tests'],
    testMap: Map<string, Test>,
  ): string | null {
    for (const selectedTest of tests ?? []) {
      const departmentId = testMap.get(selectedTest.testId)?.departmentId ?? null;
      if (departmentId) return departmentId;
    }
    return null;
  }

  private buildSampleGroupingKey(
    labelSequenceBy: 'tube_type' | 'department',
    tubeType: SampleTubeType | null,
    departmentId: string | null,
  ): string {
    if (labelSequenceBy === 'department') {
      return `department:${departmentId ?? 'none'}|tube:${tubeType ?? 'none'}`;
    }
    return `tube:${tubeType ?? 'none'}`;
  }

  private async bulkCreateOrderTests(
    manager: EntityManager,
    labId: string,
    sampleWithTestsArr: Array<{ sampleId: string; tests: Test[] }>,
    shiftId: string | null,
    patientType: PatientType,
    precomputedPricingMap?: Map<string, number>,
  ): Promise<void> {
    const orderTestRepo = manager.getRepository(OrderTest);

    const allTestIds = new Set<string>();
    for (const item of sampleWithTestsArr) {
      for (const t of item.tests) {
        allTestIds.add(t.id);
      }
    }
    const uniqueTestIds = Array.from(allTestIds);
    if (uniqueTestIds.length === 0) return;

    let pricingMap = precomputedPricingMap;
    if (!pricingMap) {
      pricingMap = await this.resolvePricingForTests(
        labId,
        uniqueTestIds,
        shiftId,
        patientType,
        manager,
      );
    }

    const panelTestIds = uniqueTestIds.filter(id => {
      for (const item of sampleWithTestsArr) {
        if (item.tests.find(t => t.id === id)?.type === TestType.PANEL) return true;
      }
      return false;
    });

    const componentsByPanelId = new Map<string, TestComponent[]>();
    if (panelTestIds.length > 0) {
      const allComponents = await manager.getRepository(TestComponent)
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

    // Build all OrderTest entities in one pass, then bulk-save
    const toSave: OrderTest[] = [];

    for (const { sampleId, tests } of sampleWithTestsArr) {
      for (const test of tests) {
        const price = pricingMap.get(test.id) ?? 0;

        if (test.type === TestType.PANEL) {
          // Pre-generate UUID so we can assign children immediately without hitting the DB first.
          const parentId = require('crypto').randomUUID();
          toSave.push(orderTestRepo.create({
            id: parentId,
            labId,
            sampleId,
            testId: test.id,
            parentOrderTestId: null,
            status: OrderTestStatus.PENDING,
            price,
          }));

          const components = componentsByPanelId.get(test.id) ?? [];
          for (const comp of components) {
            toSave.push(orderTestRepo.create({
              labId,
              sampleId,
              testId: comp.childTestId,
              parentOrderTestId: parentId,
              status: OrderTestStatus.PENDING,
              price: null,
              panelSortOrder: comp.sortOrder ?? null,
            } as OrderTest));
          }
        } else {
          toSave.push(orderTestRepo.create({
            labId,
            sampleId,
            testId: test.id,
            parentOrderTestId: null,
            status: OrderTestStatus.PENDING,
            price,
          }));
        }
      }
    }

    if (toSave.length > 0) {
      await orderTestRepo.save(toSave);
    }
  }

  private createOrderSampleBarcodeAllocator(
    orderNumber: string | null,
    existingBarcodes: Array<string | null>,
  ): () => string {
    const normalizedOrderNumber = orderNumber?.trim() ?? '';
    const normalizedBarcodes = existingBarcodes
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => value.length > 0);

    if (/^\d+$/.test(normalizedOrderNumber)) {
      const width = normalizedOrderNumber.length;
      let maxValue = Number(normalizedOrderNumber);
      for (const barcode of normalizedBarcodes) {
        if (!/^\d+$/.test(barcode)) continue;
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

  private isOrderTestProcessed(orderTest: OrderTest): boolean {
    return (
      orderTest.status !== OrderTestStatus.PENDING ||
      orderTest.resultValue !== null ||
      (orderTest.resultText?.trim()?.length ?? 0) > 0 ||
      (orderTest.resultParameters != null && Object.keys(orderTest.resultParameters).length > 0) ||
      orderTest.resultedAt !== null ||
      orderTest.verifiedAt !== null
    );
  }

  private getPricingPriority(
    pricing: Pricing,
    shiftId: string | null,
    patientType: PatientType,
  ): number {
    const matchesShift = pricing.shiftId === shiftId;
    const isDefaultShift = pricing.shiftId === null;
    const matchesPatientType = pricing.patientType === patientType;
    const isDefaultPatientType = pricing.patientType === null;

    if (shiftId) {
      if (matchesShift && matchesPatientType) return 0;
      if (matchesShift && isDefaultPatientType) return 1;
      if (isDefaultShift && matchesPatientType) return 2;
      if (isDefaultShift && isDefaultPatientType) return 3;
    } else {
      if (isDefaultShift && matchesPatientType) return 0;
      if (isDefaultShift && isDefaultPatientType) return 1;
    }

    // Fallback priority (any active price): prefer default shift, then default patient type.
    return 100 + (isDefaultShift ? 0 : 10) + (isDefaultPatientType ? 0 : 1);
  }

  private selectBestPricing(
    candidates: Pricing[],
    shiftId: string | null,
    patientType: PatientType,
  ): Pricing | null {
    let best: Pricing | null = null;
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

      // Stable tie-breaker: pick the most recently updated config.
      const bestUpdated = best.updatedAt?.getTime?.() ?? 0;
      const currentUpdated = pricing.updatedAt?.getTime?.() ?? 0;
      if (currentUpdated > bestUpdated) {
        best = pricing;
      }
    }

    return best;
  }

  private async resolvePricingForTests(
    labId: string,
    testIds: string[],
    shiftId: string | null,
    patientType: PatientType,
    manager: EntityManager = this.orderRepo.manager,
  ): Promise<Map<string, number>> {
    const uniqueTestIds = [...new Set((testIds ?? []).filter(Boolean))];
    const pricingMap = new Map<string, number>();

    if (uniqueTestIds.length === 0) {
      return pricingMap;
    }

    const rows = await manager
      .getRepository(Pricing)
      .createQueryBuilder('pricing')
      .where('pricing.labId = :labId', { labId })
      .andWhere('pricing.testId IN (:...testIds)', { testIds: uniqueTestIds })
      .andWhere('pricing.isActive = :isActive', { isActive: true })
      .getMany();

    const rowsByTestId = new Map<string, Pricing[]>();
    for (const row of rows) {
      const current = rowsByTestId.get(row.testId) ?? [];
      current.push(row);
      rowsByTestId.set(row.testId, current);
    }

    for (const testId of uniqueTestIds) {
      const selected = this.selectBestPricing(
        rowsByTestId.get(testId) ?? [],
        shiftId,
        patientType,
      );
      const numericPrice = selected ? Number(selected.price) : 0;
      pricingMap.set(testId, Number.isFinite(numericPrice) ? numericPrice : 0);
    }

    return pricingMap;
  }

  /**
   * Returns the next order number that would be assigned (preview only; actual number is set at create).
   * Logic: sequential per lab, per calendar day; one number per order.
   * Format: YYMMDD + 3-digit sequence (e.g. 260216001).
   */
  async getNextOrderNumber(labId: string, shiftId: string | null): Promise<string> {
    return this.computeNextOrderNumber(labId, shiftId);
  }

  /**
   * Generates a unique order number stored in the database as orderNumber.
   * Uses same logic as getNextOrderNumber. All samples of the order share this barcode value.
   */
  private async generateOrderNumber(
    labId: string,
    _shiftId: string | null,
    increment: number = 1,
    manager: EntityManager = this.orderRepo.manager,
    options?: {
      now?: Date;
      timeZone?: string;
      dateKey?: string;
    },
  ): Promise<string> {
    const now = options?.now ?? new Date();
    const timeZone = options?.timeZone ?? (await this.getLabTimeZone(labId, manager));
    const dateKey = options?.dateKey ?? formatDateKeyForTimeZone(now, timeZone);
    const dateStr = formatOrderDatePrefixForTimeZone(now, timeZone);
    const floor = await this.getMaxOrderSequenceForDate(labId, dateStr, manager);
    const nextSeq = await nextLabCounterValueWithFloor(manager, {
      labId,
      counterType: 'ORDER_NUMBER',
      scopeKey: 'ORDER',
      date: now,
      dateKey,
      shiftId: null,
    }, floor, increment);
    return `${dateStr}${String(nextSeq).padStart(3, '0')}`;
  }

  private async computeNextOrderNumber(labId: string, _shiftId: string | null): Promise<string> {
    const now = new Date();
    const timeZone = await this.getLabTimeZone(labId);
    const dateKey = formatDateKeyForTimeZone(now, timeZone);
    const dateStr = formatOrderDatePrefixForTimeZone(now, timeZone);
    const floor = await this.getMaxOrderSequenceForDate(labId, dateStr);
    const counterNextSeq = await peekNextLabCounterValue(this.orderRepo.manager, {
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

  private async getMaxOrderSequenceForDate(
    labId: string,
    datePrefix: string,
    manager: EntityManager = this.orderRepo.manager,
  ): Promise<number> {
    const rangeStart = `${datePrefix}000`;
    const rangeEnd = `${datePrefix}999`;
    const rows = await manager.query(
      `
        SELECT COALESCE(MAX(CAST(RIGHT("orderNumber", 3) AS integer)), 0) AS "maxSeq"
        FROM "orders"
        WHERE "labId" = $1
          AND "orderNumber" BETWEEN $2 AND $3
          AND CHAR_LENGTH("orderNumber") = 9
      `,
      [labId, rangeStart, rangeEnd],
    ) as Array<{ maxSeq: string | number | null }>;

    const maxSeq = Number(rows?.[0]?.maxSeq ?? 0);
    if (!Number.isFinite(maxSeq) || maxSeq < 0) {
      return 0;
    }
    return Math.floor(maxSeq);
  }

  /**
   * Returns the next tube sequence number (1, 2, 3...) for the given scope (tube type or department).
   * When sequenceResetBy is 'day', counts all samples that day (any shift). When 'shift', counts only that shift.
   */
  private async getNextSequenceForScope(
    labId: string,
    sequenceResetBy: 'day' | 'shift',
    shiftId: string | null,
    scopeKey: string | null,
    labelSequenceBy: 'tube_type' | 'department',
    dateKey: string | null = null,
    manager: EntityManager = this.orderRepo.manager,
  ): Promise<number> {
    const counterType =
      labelSequenceBy === 'department' ? 'SAMPLE_SEQUENCE_DEPARTMENT' : 'SAMPLE_SEQUENCE_TUBE';
    const scopedShiftId = sequenceResetBy === 'shift' ? shiftId ?? null : null;
    return nextLabCounterValue(manager, {
      labId,
      counterType,
      scopeKey: scopeKey ?? '__none__',
      dateKey: dateKey ?? undefined,
      shiftId: scopedShiftId,
    });
  }

  async estimatePrice(
    labId: string,
    testIds: string[],
    shiftId: string | null = null,
  ): Promise<{ subtotal: number }> {
    if (!testIds?.length) return { subtotal: 0 };
    const uniqueTestIds = [...new Set(testIds)];
    const patientType = PatientType.WALK_IN;
    const pricingMap = await this.resolvePricingForTests(
      labId,
      uniqueTestIds,
      shiftId,
      patientType,
    );
    const subtotal = uniqueTestIds.reduce(
      (sum, testId) => sum + (pricingMap.get(testId) ?? 0),
      0,
    );
    return { subtotal };
  }

  async getOrdersTodayCount(labId: string): Promise<number> {
    const timeZone = await this.getLabTimeZone(labId);
    const { startDate: startOfDay, endDate: endOfDay } = this.getDateRangeOrThrow(
      formatDateKeyForTimeZone(new Date(), timeZone),
      timeZone,
      'today',
    );

    return this.orderRepo.count({
      where: {
        labId,
        registeredAt: Between(startOfDay, endOfDay),
      },
    });
  }

  async getTodayPatients(labId: string): Promise<
    Array<{ patient: Patient; orderCount: number; lastOrderAt: Date | null }>
  > {
    const timeZone = await this.getLabTimeZone(labId);
    const { startDate: startOfDay, endDate: endOfDay } = this.getDateRangeOrThrow(
      formatDateKeyForTimeZone(new Date(), timeZone),
      timeZone,
      'today',
    );

    // Get all orders today with patients
    const orders = await this.orderRepo.find({
      where: {
        labId,
        registeredAt: Between(startOfDay, endOfDay),
      },
      relations: ['patient'],
      order: { registeredAt: 'DESC' },
    });

    // Group by patient
    const patientMap = new Map<
      string,
      { patient: Patient; orderCount: number; lastOrderAt: Date | null }
    >();

    for (const order of orders) {
      const patientId = order.patientId;
      if (!patientMap.has(patientId)) {
        patientMap.set(patientId, {
          patient: order.patient,
          orderCount: 1,
          lastOrderAt: order.registeredAt,
        });
      } else {
        const existing = patientMap.get(patientId)!;
        existing.orderCount++;
        if (!existing.lastOrderAt || order.registeredAt > existing.lastOrderAt) {
          existing.lastOrderAt = order.registeredAt;
        }
      }
    }

    // Convert to array and sort by most recent order
    return Array.from(patientMap.values()).sort((a, b) => {
      if (!a.lastOrderAt) return 1;
      if (!b.lastOrderAt) return -1;
      return b.lastOrderAt.getTime() - a.lastOrderAt.getTime();
    });
  }

  async getOrdersTrend(labId: string, days: number): Promise<{ date: string; count: number }[]> {
    const timeZone = await this.getLabTimeZone(labId);
    const todayDateKey = formatDateKeyForTimeZone(new Date(), timeZone);
    const startDateKey = addDaysToDateKey(todayDateKey, -(days - 1));
    const { startDate } = getUtcRangeForLabDate(startDateKey, timeZone);
    const { endDate } = getUtcRangeForLabDate(todayDateKey, timeZone);
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
      .getRawMany<{ date: string; count: string }>();

    // Fill in missing dates with 0
    const resultMap = new Map<string, number>();
    for (let offset = 0; offset < days; offset++) {
      resultMap.set(addDaysToDateKey(startDateKey, offset), 0);
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

  /** Statistics for a date range: order counts by status/shift and revenue */
  async getOrderStatsForPeriod(
    labId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byShift: { shiftId: string | null; shiftName: string; count: number }[];
    revenue: number;
  }> {
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
    const byStatus: Record<string, number> = {};
    for (const s of Object.values(OrderStatus)) {
      byStatus[s] = 0;
    }
    for (const row of statusRows) {
      byStatus[row.status] = parseInt(row.count, 10);
    }

    const byShift = shiftRows.map((row) => ({
      shiftId: row.shiftId as string | null,
      shiftName: (row.shiftName as string) || 'No shift',
      count: parseInt(row.count, 10),
    }));

    const revenue = parseFloat(revenueRow?.revenue ?? '0');

    return { total, byStatus, byShift, revenue };
  }

  private async applyOrderQueryFilters(
    qb: SelectQueryBuilder<Order>,
    labId: string,
    params: OrderListQueryParams,
  ): Promise<void> {
    if (params.status) {
      if (params.status === OrderStatus.COMPLETED) {
        qb.andWhere(
          `("order"."status" = :status OR EXISTS (
            SELECT 1
            FROM samples s
            INNER JOIN order_tests ot ON ot."sampleId" = s.id
            WHERE s."orderId" = "order"."id"
              AND ot.status IN (:...completedStatuses)
          ))`,
          {
            status: params.status,
            completedStatuses: [
              OrderTestStatus.COMPLETED,
              OrderTestStatus.VERIFIED,
              OrderTestStatus.REJECTED,
            ],
          },
        );
      } else {
        qb.andWhere('order.status = :status', { status: params.status });
      }
    }

    if (params.patientId) {
      qb.andWhere('order.patientId = :patientId', { patientId: params.patientId });
    }

    if (params.search?.trim()) {
      const term = `%${params.search.trim()}%`;
      const exactSearch = params.search.trim();
      qb.andWhere(
        '(order.orderNumber ILIKE :term OR patient.fullName ILIKE :term OR patient.patientNumber = :exactSearch OR patient.phone ILIKE :term)',
        { term, exactSearch },
      );
    }

    const labTimeZone =
      params.startDate || params.endDate ? await this.getLabTimeZone(labId) : null;
    if (params.startDate && params.endDate && labTimeZone) {
      const { startDate } = this.getDateRangeOrThrow(params.startDate, labTimeZone, 'startDate');
      const { endDate } = this.getDateRangeOrThrow(params.endDate, labTimeZone, 'endDate');
      if (startDate.getTime() > endDate.getTime()) {
        throw new BadRequestException('startDate cannot be after endDate');
      }
      qb.andWhere('order.registeredAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (params.startDate && labTimeZone) {
      const { startDate } = this.getDateRangeOrThrow(params.startDate, labTimeZone, 'startDate');
      qb.andWhere('order.registeredAt >= :startDate', { startDate });
    } else if (params.endDate && labTimeZone) {
      const { endDate } = this.getDateRangeOrThrow(params.endDate, labTimeZone, 'endDate');
      qb.andWhere('order.registeredAt <= :endDate', { endDate });
    }
  }

  private async enrichOrdersWithProgress(items: OrderProgressTarget[]): Promise<void> {
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
          OrderTestStatus.COMPLETED,
          OrderTestStatus.VERIFIED,
          OrderTestStatus.REJECTED,
        ],
      })
      .groupBy('s."orderId"')
      .getRawMany<{ orderId: string; cnt: string }>();

    const progressedSet = new Set(progressed.map((row) => row.orderId));

    const testCounts = await this.orderRepo.manager
      .createQueryBuilder()
      .select('s."orderId"', 'orderId')
      // Only count root-level tests (parent rows). Panel children are excluded so a
      // panel test counts as 1, not 1 + number-of-children.
      .addSelect('COUNT(*) FILTER (WHERE ot."parentOrderTestId" IS NULL)', 'totalTests')
      .addSelect(
        `SUM(CASE WHEN ot.status IN (:...readyStatuses) AND ot."parentOrderTestId" IS NULL THEN 1 ELSE 0 END)`,
        'readyTests',
      )
      .from('order_tests', 'ot')
      .innerJoin('samples', 's', 's.id = ot."sampleId"')
      .where('s."orderId" IN (:...orderIds)', { orderIds })
      .setParameter('readyStatuses', [
        OrderTestStatus.COMPLETED,
        OrderTestStatus.VERIFIED,
        OrderTestStatus.REJECTED,
      ])
      .groupBy('s."orderId"')
      .getRawMany<{ orderId: string; totalTests: string; readyTests: string }>();


    const countMap = new Map(
      testCounts.map((row) => [
        row.orderId,
        {
          totalTests: parseInt(row.totalTests, 10) || 0,
          readyTests: parseInt(row.readyTests, 10) || 0,
        },
      ]),
    );

    for (const order of items) {
      const counts = countMap.get(order.id) || { totalTests: 0, readyTests: 0 };
      order.testsCount = counts.totalTests;
      order.readyTestsCount = counts.readyTests;
      order.reportReady = counts.readyTests > 0;

      if (order.status !== OrderStatus.CANCELLED && progressedSet.has(order.id)) {
        order.status = OrderStatus.COMPLETED;
      }
    }
  }

  private normalizePaymentStatus(value: string | null | undefined): 'unpaid' | 'partial' | 'paid' {
    if (value === 'paid') return 'paid';
    if (value === 'partial') return 'partial';
    return 'unpaid';
  }

  private async getLabTimeZone(
    labId: string,
    manager: EntityManager = this.orderRepo.manager,
  ): Promise<string> {
    const lab = await manager.getRepository(Lab).findOne({ where: { id: labId } });
    return normalizeLabTimeZone(lab?.timezone);
  }

  private getDateRangeOrThrow(
    dateValue: string,
    timeZone: string,
    paramName: string,
  ): { startDate: Date; endDate: Date } {
    try {
      const { startDate, endDate } = getUtcRangeForLabDate(dateValue, timeZone);
      return { startDate, endDate };
    } catch {
      throw new BadRequestException(`Invalid ${paramName}. Expected YYYY-MM-DD.`);
    }
  }

  async getWorklist(labId: string, shiftId: string | null): Promise<WorklistItemResponse[]> {
    const shiftKey = shiftId ?? '';
    const row = await this.worklistRepo.findOne({ where: { labId, shiftId: shiftKey } });
    const raw: WorklistItemStored[] = row?.itemsJson
      ? (JSON.parse(row.itemsJson) as WorklistItemStored[])
      : [];
    if (raw.length === 0) return [];

    const patientIds = [...new Set(raw.map((r) => r.patientId))];
    const orderIds = [...new Set(raw.map((r) => r.orderId).filter(Boolean))] as string[];

    const patients = await this.patientRepo.find({
      where: patientIds.map((id) => ({ id })),
    });
    const patientMap = new Map(patients.map((p) => [p.id, p]));

    let orders: Order[] = [];
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
        if (!patient) return null;
        return { rowId: item.rowId, patient, createdOrder };
      })
      .filter((r): r is WorklistItemResponse => r !== null);
  }

  async saveWorklist(labId: string, shiftId: string | null, items: WorklistItemStored[]): Promise<void> {
    const shiftKey = shiftId ?? '';
    const itemsJson = JSON.stringify(items);
    await this.worklistRepo.upsert({ labId, shiftId: shiftKey, itemsJson }, ['labId', 'shiftId']);
  }
}
