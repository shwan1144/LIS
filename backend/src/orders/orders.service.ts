import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, IsNull } from 'typeorm';
import { Order, OrderStatus, PatientType } from '../entities/order.entity';
import { Sample } from '../entities/sample.entity';
import { OrderTest, OrderTestStatus } from '../entities/order-test.entity';
import { Patient } from '../entities/patient.entity';
import { Lab } from '../entities/lab.entity';
import { Shift } from '../entities/shift.entity';
import { Test, TestType } from '../entities/test.entity';
import { Pricing } from '../entities/pricing.entity';
import { TestComponent } from '../entities/test-component.entity';
import { LabOrdersWorklist } from '../entities/lab-orders-worklist.entity';
import { CreateOrderDto } from './dto/create-order.dto';

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
      where: uniqueTestIds.map((id) => ({ id })),
    });
    if (tests.length !== uniqueTestIds.length) {
      throw new NotFoundException('One or more tests not found');
    }
    const testMap = new Map<string, Test>(tests.map((t) => [t.id, t]));

    // Calculate pricing
    const patientType = dto.patientType || PatientType.WALK_IN;
    let totalAmount = 0;

    // Get pricing for each test
    const pricingMap = new Map<string, number>();
    for (const testId of uniqueTestIds) {
      const pricing = await this.findPricing(
        labId,
        testId,
        dto.shiftId || null,
        patientType,
      );
      pricingMap.set(testId, pricing);
      totalAmount += pricing;
    }

    const discountPercent = Math.min(100, Math.max(0, dto.discountPercent ?? 0));
    const finalAmount = Math.round(totalAmount * (1 - discountPercent / 100) * 100) / 100;

    const labelSequenceBy = lab.labelSequenceBy === 'department' ? 'department' : 'tube_type';
    const sequenceResetBy = lab.sequenceResetBy === 'shift' ? 'shift' : 'day';
    const effectiveShiftId =
      sequenceResetBy === 'shift' ? dto.shiftId || null : null;

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
    for (let i = 0; i < dto.samples.length; i++) {
      const sampleDto = dto.samples[i];
      const sampleBarcode = `${datePart}${String(seq + i).padStart(3, '0')}`;
      const scopeKey =
        labelSequenceBy === 'department'
          ? (sampleDto.tests[0] && testMap.get(sampleDto.tests[0].testId)?.departmentId) ?? null
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

        // If this is a panel, create parent OrderTest + child OrderTests
        if (test.type === TestType.PANEL) {
          // 1. Create parent OrderTest for the panel
          const parentOrderTest = this.orderRepo.manager.create(OrderTest, {
            labId,
            sampleId: savedSample.id,
            testId: test.id,
            parentOrderTestId: null,
            status: OrderTestStatus.PENDING,
            price: pricingMap.get(test.id) || null,
          });
          const savedParent = await this.orderRepo.manager.save(parentOrderTest);

          // 2. Get child components from TestComponent table
          const components = await this.testComponentRepo.find({
            where: {
              panelTestId: test.id,
              // TODO: Filter by effectiveFrom/effectiveTo if versioning is used
            },
            relations: ['childTest'],
            order: { sortOrder: 'ASC' },
          });

          // 3. Create child OrderTests for each component
          for (const component of components) {
            const childOrderTest = this.orderRepo.manager.create(OrderTest, {
              labId,
              sampleId: savedSample.id,
              testId: component.childTestId,
              parentOrderTestId: savedParent.id,
              status: OrderTestStatus.PENDING,
              // Children don't carry price; parent panel does
              price: null,
            });
            await this.orderRepo.manager.save(childOrderTest);
          }
        } else {
          // Regular single test
          const orderTest = this.orderRepo.manager.create(OrderTest, {
            labId,
            sampleId: savedSample.id,
            testId: testDto.testId,
            parentOrderTestId: null,
            status: OrderTestStatus.PENDING,
            price: pricingMap.get(testDto.testId) || null,
          });
          await this.orderRepo.manager.save(orderTest);
        }
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
    return this.computeNextOrderNumber(labId, shiftId);
  }

  private async computeNextOrderNumber(labId: string, shiftId: string | null): Promise<string> {
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
      .from(Sample, 'sample')
      .innerJoin('sample.order', 'order')
      .where('order.labId = :labId', { labId })
      .andWhere('order.registeredAt BETWEEN :startOfDay AND :endOfDay', {
        startOfDay,
        endOfDay,
      });

    if (shiftId == null) {
      qb.andWhere('order.shiftId IS NULL');
    } else {
      qb.andWhere('order.shiftId = :shiftId', { shiftId });
    }

    const result = await qb.getRawOne<{ count: string | number }>();
    const count = Number(result?.count ?? 0) | 0;
    const sequence = String(count + 1).padStart(3, '0');
    return `${dateStr}${sequence}`;
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
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Per day: no shift filter. Per shift: only count orders in this shift.
    const applyShiftFilter = (qb: { andWhere: (clause: string, params?: object) => void }) => {
      if (sequenceResetBy !== 'shift') return;
      if (shiftId == null) {
        qb.andWhere('order.shiftId IS NULL');
      } else {
        qb.andWhere('order.shiftId = :shiftId', { shiftId });
      }
    };

    if (labelSequenceBy === 'tube_type') {
      const qb = this.orderRepo.manager
        .createQueryBuilder()
        .select('COUNT(sample.id)', 'count')
        .from(Sample, 'sample')
        .innerJoin('sample.order', 'order')
        .where('order.labId = :labId', { labId })
        .andWhere('order.registeredAt BETWEEN :startOfDay AND :endOfDay', {
          startOfDay,
          endOfDay,
        });
      applyShiftFilter(qb);
      if (scopeKey == null) {
        qb.andWhere('sample.tubeType IS NULL');
      } else {
        qb.andWhere('sample.tubeType = :scopeKey', { scopeKey });
      }
      const result = await qb.getRawOne<{ count: string | number }>();
      const count = Number(result?.count ?? 0) | 0;
      return count + 1;
    }

    // By department: count distinct samples that have at least one orderTest with test.departmentId = scopeKey
    const qb = this.orderRepo.manager
      .createQueryBuilder()
      .select('COUNT(DISTINCT sample.id)', 'count')
      .from(Sample, 'sample')
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
    } else {
      qb.andWhere('test.departmentId = :scopeKey', { scopeKey });
    }
    const result = await qb.getRawOne<{ count: string | number }>();
    const count = Number(result?.count ?? 0) | 0;
    return count + 1;
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
