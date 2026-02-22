import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, EntityManager } from 'typeorm';
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
import { nextLabCounterValue, peekNextLabCounterValue } from '../database/lab-counter.util';

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
  ) {}

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
    let totalAmount = 0;

    // Get pricing for each test
    for (const testId of uniqueTestIds) {
      const pricing = await this.findPricing(
        labId,
        testId,
        dto.shiftId || null,
        patientType,
      );
      totalAmount += pricing;
    }

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

    // Generate order number (sequential per lab, per day, per shift; restarts when shift or day changes)
    const orderNumber = await this.generateOrderNumber(labId, dto.shiftId || null);

    // Create order
    const order = this.orderRepo.create({
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

    const savedOrder = await this.orderRepo.save(order);

    // Create samples and order tests (compact barcode: YYMMDD + 3-digit sequence per sample)
    const datePart = orderNumber.slice(0, 6);
    let seq = parseInt(orderNumber.slice(-3), 10);
    for (let i = 0; i < samplesToCreate.length; i++) {
      const sampleDto = samplesToCreate[i];
      const sampleBarcode = `${datePart}${String(seq + i).padStart(3, '0')}`;
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
      );
      const sample = this.orderRepo.manager.create(Sample, {
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
          // Should not happen due to earlier validation
          continue;
        }
        await this.createOrderTestsForSample(
          this.orderRepo.manager,
          labId,
          savedSample.id,
          test,
          dto.shiftId ?? null,
          patientType,
        );
      }
    }

    // Reload order with relations
    return this.orderRepo.findOne({
      where: { id: savedOrder.id },
      relations: ['patient', 'lab', 'shift', 'samples', 'samples.orderTests', 'samples.orderTests.test'],
    }) as Promise<Order>;
  }

  async findAll(labId: string, params: {
    page?: number;
    size?: number;
    search?: string;
    status?: OrderStatus;
    patientId?: string;
    startDate?: string;
    endDate?: string;
  }) {
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

    if (params.startDate && params.endDate) {
      const startDate = new Date(params.startDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(params.endDate);
      endDate.setHours(23, 59, 59, 999);
      qb.andWhere('order.registeredAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (params.startDate) {
      const startDate = new Date(params.startDate);
      startDate.setHours(0, 0, 0, 0);
      qb.andWhere('order.registeredAt >= :startDate', { startDate });
    } else if (params.endDate) {
      const endDate = new Date(params.endDate);
      endDate.setHours(23, 59, 59, 999);
      qb.andWhere('order.registeredAt <= :endDate', { endDate });
    }

    qb.orderBy('order.registeredAt', 'DESC').skip(skip).take(size);

    const [items, total] = await qb.getManyAndCount();

    // Backfill display status dynamically: if any test has a finalized result,
    // treat order as COMPLETED in API response even when stored status is stale.
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
            OrderTestStatus.COMPLETED,
            OrderTestStatus.VERIFIED,
            OrderTestStatus.REJECTED,
          ],
        })
        .groupBy('s."orderId"')
        .getRawMany<{ orderId: string; cnt: string }>();

      const progressedSet = new Set(progressed.map((r) => r.orderId));

      const testCounts = await this.orderRepo.manager
        .createQueryBuilder()
        .select('s."orderId"', 'orderId')
        .addSelect('COUNT(*)', 'totalTests')
        .addSelect(
          `SUM(CASE WHEN ot.status IN (:...readyStatuses) THEN 1 ELSE 0 END)`,
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
        testCounts.map((r) => [
          r.orderId,
          {
            totalTests: parseInt(r.totalTests, 10) || 0,
            readyTests: parseInt(r.readyTests, 10) || 0,
          },
        ]),
      );

      for (const order of items) {
        const counts = countMap.get(order.id) || { totalTests: 0, readyTests: 0 };
        (order as unknown as Record<string, unknown>).testsCount = counts.totalTests;
        (order as unknown as Record<string, unknown>).readyTestsCount = counts.readyTests;
        (order as unknown as Record<string, unknown>).reportReady = counts.readyTests > 0;

        if (order.status !== OrderStatus.CANCELLED && progressedSet.has(order.id)) {
          order.status = OrderStatus.COMPLETED;
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

      const nextBarcode = this.createOrderSampleBarcodeAllocator(
        order.orderNumber,
        refreshedSamples.map((sample) => sample.barcode),
      );

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
          );

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

        await this.createOrderTestsForSample(
          manager,
          labId,
          targetSample.id,
          test,
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
        sampleId?: string;
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

  private async createOrderTestsForSample(
    manager: EntityManager,
    labId: string,
    sampleId: string,
    test: Test,
    shiftId: string | null,
    patientType: PatientType,
  ): Promise<void> {
    const orderTestRepo = manager.getRepository(OrderTest);
    const panelPrice = await this.findPricing(labId, test.id, shiftId, patientType);

    if (test.type === TestType.PANEL) {
      const parentOrderTest = orderTestRepo.create({
        labId,
        sampleId,
        testId: test.id,
        parentOrderTestId: null,
        status: OrderTestStatus.PENDING,
        price: panelPrice,
      });
      const savedParent = await orderTestRepo.save(parentOrderTest);

      const components = await manager.getRepository(TestComponent)
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
          status: OrderTestStatus.PENDING,
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
      status: OrderTestStatus.PENDING,
      price: panelPrice,
    });
    await orderTestRepo.save(orderTest);
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

  private async findPricing(
    labId: string,
    testId: string,
    shiftId: string | null,
    patientType: PatientType,
  ): Promise<number> {
    // Try to find most specific pricing first using QueryBuilder for better null handling
    // Priority: lab + test + shift + patientType > lab + test + shift > lab + test + patientType > lab + test
    const qb = this.pricingRepo.createQueryBuilder('pricing')
      .where('pricing.labId = :labId', { labId })
      .andWhere('pricing.testId = :testId', { testId })
      .andWhere('pricing.isActive = :isActive', { isActive: true });

    // Try most specific first: with shift and patientType
    if (shiftId) {
      qb.andWhere(
        '(pricing.shiftId = :shiftId AND pricing.patientType = :patientType) OR ' +
        '(pricing.shiftId = :shiftId AND pricing.patientType IS NULL) OR ' +
        '(pricing.shiftId IS NULL AND pricing.patientType = :patientType) OR ' +
        '(pricing.shiftId IS NULL AND pricing.patientType IS NULL)',
        { shiftId, patientType }
      );
    } else {
      qb.andWhere(
        '(pricing.shiftId IS NULL AND pricing.patientType = :patientType) OR ' +
        '(pricing.shiftId IS NULL AND pricing.patientType IS NULL)',
        { patientType }
      );
    }

    qb.orderBy('pricing.shiftId', 'ASC')
      .addOrderBy('pricing.patientType', 'ASC')
      .limit(1);

    let pricing = await qb.getOne();

    // Fallback: if no default/specific price, use any active price for this lab+test (e.g. per-shift only)
    if (!pricing) {
      const fallback = await this.pricingRepo.findOne({
        where: { labId, testId, isActive: true },
        order: { shiftId: 'ASC' }, // prefer default (shiftId null) if present
      });
      pricing = fallback ?? null;
    }

    if (!pricing) {
      return 0;
    }

    return parseFloat(pricing.price.toString());
  }

  /**
   * Returns the next order number that would be assigned (preview only; actual number is set at create).
   * Logic: sequential per lab, per calendar day; one number per sample so barcodes are unique.
   * Format: YYMMDD + 3-digit sequence (e.g. 260216001).
   */
  async getNextOrderNumber(labId: string, shiftId: string | null): Promise<string> {
    return this.computeNextOrderNumber(labId, shiftId);
  }

  /**
   * Generates a unique order number stored in the database as orderNumber.
   * Uses same logic as getNextOrderNumber. First sample of the order gets this as barcode.
   */
  private async generateOrderNumber(labId: string, shiftId: string | null): Promise<string> {
    const today = new Date();
    const yy = String(today.getFullYear() % 100).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yy}${mm}${dd}`;
    const nextSeq = await nextLabCounterValue(this.orderRepo.manager, {
      labId,
      counterType: 'ORDER_NUMBER',
      scopeKey: 'ORDER',
      date: today,
      shiftId,
    });
    return `${dateStr}${String(nextSeq).padStart(3, '0')}`;
  }

  private async computeNextOrderNumber(labId: string, shiftId: string | null): Promise<string> {
    const today = new Date();
    const yy = String(today.getFullYear() % 100).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yy}${mm}${dd}`;
    const nextSeq = await peekNextLabCounterValue(this.orderRepo.manager, {
      labId,
      counterType: 'ORDER_NUMBER',
      scopeKey: 'ORDER',
      date: today,
      shiftId,
    });
    return `${dateStr}${String(nextSeq).padStart(3, '0')}`;
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
  ): Promise<number> {
    const counterType =
      labelSequenceBy === 'department' ? 'SAMPLE_SEQUENCE_DEPARTMENT' : 'SAMPLE_SEQUENCE_TUBE';
    const scopedShiftId = sequenceResetBy === 'shift' ? shiftId ?? null : null;
    return nextLabCounterValue(this.orderRepo.manager, {
      labId,
      counterType,
      scopeKey: scopeKey ?? '__none__',
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
    let subtotal = 0;
    const patientType = PatientType.WALK_IN;
    for (const testId of uniqueTestIds) {
      const price = await this.findPricing(labId, testId, shiftId, patientType);
      subtotal += price;
    }
    return { subtotal };
  }

  async getOrdersTodayCount(labId: string): Promise<number> {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

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
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

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

    // Fill in missing dates with 0
    const resultMap = new Map<string, number>();
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
    const existing = await this.worklistRepo.findOne({ where: { labId, shiftId: shiftKey } });
    if (existing) {
      await this.worklistRepo.update({ labId, shiftId: shiftKey }, { itemsJson });
      return;
    }
    try {
      await this.worklistRepo.insert({ labId, shiftId: shiftKey, itemsJson });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === '23505') {
        await this.worklistRepo.update({ labId }, { shiftId: shiftKey, itemsJson });
      } else {
        throw err;
      }
    }
  }
}
