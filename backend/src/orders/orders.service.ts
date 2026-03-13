import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, EntityManager, SelectQueryBuilder } from 'typeorm';
import { DeliveryMethod, Order, OrderStatus, PatientType } from '../entities/order.entity';
import { Sample, TubeType as SampleTubeType } from '../entities/sample.entity';
import { OrderTest, OrderTestStatus } from '../entities/order-test.entity';
import { Patient } from '../entities/patient.entity';
import { Lab } from '../entities/lab.entity';
import { Shift } from '../entities/shift.entity';
import { Test, TestType } from '../entities/test.entity';
import { Pricing } from '../entities/pricing.entity';
import { TestComponent } from '../entities/test-component.entity';
import { LabOrdersWorklist } from '../entities/lab-orders-worklist.entity';
import { AuditAction } from '../entities/audit-log.entity';
import { CreateOrderDto, CreateSampleDto } from './dto/create-order.dto';
import {
  CreateOrderSummaryDto,
  CreateOrderView,
  OrderDetailView,
  OrderResultStatus,
} from './dto/create-order-response.dto';
import { AuditService } from '../audit/audit.service';
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
import { LabActorContext } from '../types/lab-actor-context';
import { normalizeOrderTestFlag } from '../order-tests/order-test-flag.util';

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
  shiftId?: string;
  startDate?: string;
  endDate?: string;
  resultStatus?: OrderResultStatus;
}

export interface OrderHistoryItem {
  id: string;
  orderNumber: string | null;
  status: OrderStatus;
  registeredAt: Date;
  deliveryMethods: DeliveryMethod[];
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  paidAmount: number | null;
  finalAmount: number;
  patient: Patient;
  shift: Shift | null;
  testsCount: number;
  readyTestsCount: number;
  reportReady: boolean;
  resultStatus: OrderResultStatus;
  pendingTestsCount: number;
  completedTestsCount: number;
  verifiedTestsCount: number;
  rejectedTestsCount: number;
}

type OrderProgressTarget = {
  id: string;
  status: OrderStatus;
  testsCount?: number;
  readyTestsCount?: number;
  reportReady?: boolean;
  pendingTestsCount?: number;
  completedTestsCount?: number;
  verifiedTestsCount?: number;
  rejectedTestsCount?: number;
  resultStatus?: OrderResultStatus;
};

type RootOrderTestRemovalAccess = {
  removable: boolean;
  requiresAdminOverride: boolean;
  blockedReason: string | null;
};

type RootOrderTestAuditItem = {
  id: string;
  testId: string;
  code: string;
  name: string;
  status: OrderTestStatus;
  requiresAdminOverride: boolean;
  isPanel: boolean;
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly createPerfLogThresholdMs = this.resolveCreatePerfLogThresholdMs();
  private readonly orderHistoryPerfLogThresholdMs = this.resolveOrderHistoryPerfLogThresholdMs();
  private readonly orderTestInsertChunkSize = this.resolveOrderTestInsertChunkSize();

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
    private readonly auditService: AuditService,
  ) { }

  async create(
    labId: string,
    dto: CreateOrderDto,
    view: CreateOrderView = CreateOrderView.SUMMARY,
  ): Promise<Order | CreateOrderSummaryDto> {
    const totalStartedAt = process.hrtime.bigint();
    const requestedTestsCount = dto.samples.reduce(
      (sum, sample) => sum + (sample.tests?.length ?? 0),
      0,
    );
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
      const shiftPromise: Promise<Shift | null> = dto.shiftId
        ? this.shiftRepo.findOne({
          where: { id: dto.shiftId, labId },
        })
        : Promise.resolve(null);
      const testsPromise: Promise<Test[]> =
        uniqueTestIds.length > 0
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
        throw new NotFoundException('Patient not found');
      }
      if (!lab) {
        throw new NotFoundException('Lab not found');
      }
      if (dto.shiftId && !shift) {
        throw new NotFoundException('Shift not found or not assigned to this lab');
      }
      if (tests.length !== uniqueTestIds.length) {
        throw new NotFoundException('One or more tests not found');
      }
      const testMap = new Map<string, Test>(tests.map((test) => [test.id, test]));
      timings.validationMs = this.elapsedMs(validationStartedAt);

      const pricingStartedAt = process.hrtime.bigint();
      const patientType = dto.patientType || PatientType.WALK_IN;
      const deliveryMethods = this.normalizeDeliveryMethods(dto.deliveryMethods);
      const pricingValues =
        uniqueTestIds.length > 0
          ? await Promise.all(
            uniqueTestIds.map((testId) =>
              this.findPricing(
                labId,
                testId,
                dto.shiftId || null,
                patientType,
              ),
            ),
          )
          : [];
      const precomputedPricingMap = new Map<string, number>();
      uniqueTestIds.forEach((id, idx) => precomputedPricingMap.set(id, pricingValues[idx]));
      const totalAmount = pricingValues.reduce((sum, value) => sum + value, 0);
      const discountPercent = Math.min(100, Math.max(0, dto.discountPercent ?? 0));
      const finalAmount = Math.round(totalAmount * (1 - discountPercent / 100) * 100) / 100;
      timings.pricingResolutionMs = this.elapsedMs(pricingStartedAt);

      const labelSequenceBy = lab.labelSequenceBy === 'department' ? 'department' : 'tube_type';
      const sequenceResetBy = lab.sequenceResetBy === 'shift' ? 'shift' : 'day';
      const effectiveShiftId =
        sequenceResetBy === 'shift' ? dto.shiftId || null : null;
      const samplesToCreate =
        labelSequenceBy === 'department'
          ? this.splitSamplesForDepartmentLabels(dto.samples, testMap)
          : dto.samples;

      return await this.orderRepo.manager.transaction(async (manager) => {
        const orderRepo = manager.getRepository(Order);
        const sampleRepo = manager.getRepository(Sample);
        const now = new Date();
        const labTimeZone = normalizeLabTimeZone(lab.timezone);
        const counterDateKey = formatDateKeyForTimeZone(now, labTimeZone);

        const counterStartedAt = process.hrtime.bigint();
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
        timings.counterOrderNumberGenerationMs = this.elapsedMs(counterStartedAt);

        const orderId = randomUUID();
        await orderRepo.insert({
          id: orderId,
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
          paymentStatus: 'unpaid',
          paidAmount: null,
          registeredAt: now,
          deliveryMethods,
        });

        const sampleInsertStartedAt = process.hrtime.bigint();
        const samplesToInsert: Array<Partial<Sample>> = [];
        const bulkTestData: Array<{ sampleId: string; tests: Test[] }> = [];
        for (const sampleDto of samplesToCreate) {
          const sampleRowId = randomUUID();
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
            .filter((entry): entry is Test => Boolean(entry));
          bulkTestData.push({ sampleId: sampleRowId, tests: testsForSample });
        }

        if (samplesToInsert.length > 0) {
          await sampleRepo.insert(samplesToInsert);
        }
        timings.sampleInsertMs = this.elapsedMs(sampleInsertStartedAt);

        const orderTestInsertStartedAt = process.hrtime.bigint();
        const rootTestsCount = await this.bulkCreateOrderTests(
          manager,
          labId,
          bulkTestData,
          dto.shiftId ?? null,
          patientType,
          precomputedPricingMap,
        );
        timings.orderTestInsertMs = this.elapsedMs(orderTestInsertStartedAt);

        const responseBuildStartedAt = process.hrtime.bigint();
        if (view === CreateOrderView.FULL) {
          const fullOrder = await orderRepo.findOne({
            where: { id: orderId },
            relations: ['patient', 'lab', 'shift', 'samples', 'samples.orderTests', 'samples.orderTests.test'],
          });
          timings.responseBuildMs = this.elapsedMs(responseBuildStartedAt);
          if (!fullOrder) {
            throw new NotFoundException('Order not found');
          }
          return fullOrder;
        }

        const summary: CreateOrderSummaryDto = {
          id: orderId,
          orderNumber,
          status: OrderStatus.REGISTERED,
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
    } finally {
      const totalMs = this.elapsedMs(totalStartedAt);
      if (totalMs >= this.createPerfLogThresholdMs) {
        this.logger.warn(
          JSON.stringify({
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
              counterOrderNumberGeneration:
                Math.round(timings.counterOrderNumberGenerationMs * 100) / 100,
              sampleInsert: Math.round(timings.sampleInsertMs * 100) / 100,
              orderTestInsert: Math.round(timings.orderTestInsertMs * 100) / 100,
              responseBuild: Math.round(timings.responseBuildMs * 100) / 100,
            },
          }),
        );
      }
    }
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
      await this.enrichOrdersWithProgress(orders as OrderProgressTarget[]);

      const items: OrderHistoryItem[] = orders.map((order) => {
        const payload = order as unknown as Record<string, unknown>;
        const testsCount = Number(payload.testsCount ?? 0) || 0;
        const readyTestsCount = Number(payload.readyTestsCount ?? 0) || 0;
        const pendingTestsCount = Number(payload.pendingTestsCount ?? 0) || 0;
        const completedTestsCount = Number(payload.completedTestsCount ?? 0) || 0;
        const verifiedTestsCount = Number(payload.verifiedTestsCount ?? 0) || 0;
        const rejectedTestsCount = Number(payload.rejectedTestsCount ?? 0) || 0;
        const reportReady =
          Boolean(payload.reportReady) ||
          (testsCount > 0 && verifiedTestsCount === testsCount);
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
    } finally {
      const durationMs = this.elapsedMs(startedAt);
      if (durationMs >= this.orderHistoryPerfLogThresholdMs) {
        this.logger.warn(
          JSON.stringify({
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
          }),
        );
      }
    }
  }

  async findOne(
    id: string,
    labId: string,
    view: OrderDetailView = OrderDetailView.COMPACT,
  ): Promise<Order> {
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
        throw new NotFoundException('Order not found');
      }
      return this.stripHeavyOrderPayload(order, view);
    } finally {
      const durationMs = this.elapsedMs(startedAt);
      if (durationMs >= this.orderHistoryPerfLogThresholdMs) {
        this.logger.warn(
          JSON.stringify({
            event: 'orders.findOne.performance',
            labId,
            orderId: id,
            view,
            durationMs: Math.round(durationMs * 100) / 100,
          }),
        );
      }
    }
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
    this.assertOrderNotCancelled(order);
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
    this.assertOrderNotCancelled(order);

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

  async updateNotes(
    id: string,
    labId: string,
    notes: string | null | undefined,
    actor: LabActorContext,
  ): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { id, labId },
      relations: ['lab'],
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    this.assertOrderNotCancelled(order);
    this.assertOrderTestsEditableToday(order);

    const normalizedNotes = typeof notes === 'string' ? notes.trim() || null : null;
    const previousNotes = order.notes ?? null;

    await this.orderRepo.update(
      { id, labId },
      { notes: normalizedNotes },
    );

    if (previousNotes !== normalizedNotes) {
      await this.auditService.log({
        actorType: actor.actorType,
        actorId: actor.actorId,
        labId,
        userId: actor.userId,
        action: AuditAction.ORDER_UPDATE,
        entityType: 'order',
        entityId: id,
        oldValues: {
          notes: previousNotes,
        },
        newValues: {
          notes: normalizedNotes,
        },
        description: `Updated referred by for order ${order.orderNumber ?? id}`,
      });
    }

    return this.findOne(id, labId);
  }

  async updateDeliveryMethods(
    id: string,
    labId: string,
    deliveryMethods?: unknown[],
  ): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id, labId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    this.assertOrderNotCancelled(order);

    order.deliveryMethods = this.normalizeDeliveryMethods(deliveryMethods);
    await this.orderRepo.save(order);
    return this.findOne(id, labId);
  }

  async updateOrderTests(
    id: string,
    labId: string,
    testIds: string[],
    actor: LabActorContext,
    actorRole?: string,
    options?: {
      forceRemoveVerified?: boolean;
      removalReason?: string | null;
    },
  ): Promise<Order> {
    const uniqueTestIds = [...new Set((testIds ?? []).map((testId) => testId?.trim()).filter(Boolean))];
    if (uniqueTestIds.length === 0) {
      throw new BadRequestException('At least one test is required');
    }
    const desiredSet = new Set(uniqueTestIds);
    const requestedRemovalReason = options?.removalReason?.trim() || null;
    const forceRemoveLockedTests = options?.forceRemoveVerified === true;
    const canForceRemoveLockedTests = this.canForceRemoveLockedTests(actor, actorRole);

    const updateResult = await this.orderRepo.manager.transaction(async (manager) => {
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
      this.assertOrderNotCancelled(order);
      this.assertOrderTestsEditableToday(order);

      const allOrderTests = order.samples.flatMap((sample) => sample.orderTests ?? []);
      const rootOrderTests = allOrderTests.filter((orderTest) => !orderTest.parentOrderTestId);
      const existingRootTestIdSet = new Set(rootOrderTests.map((orderTest) => orderTest.testId));
      const existingRootByTestId = new Map(
        rootOrderTests.map((orderTest) => [orderTest.testId, orderTest]),
      );
      const childOrderTestsByParent = new Map<string, OrderTest[]>();
      for (const orderTest of allOrderTests) {
        if (!orderTest.parentOrderTestId) continue;
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
        const reasons = Array.from(
          new Set(
            blockedRemovals
              .map(({ access }) => access.blockedReason?.trim())
              .filter((reason): reason is string => Boolean(reason)),
          ),
        ).join(' ');
        throw new BadRequestException(
          `Cannot remove tests: ${labels}.${reasons ? ` ${reasons}` : ''}`,
        );
      }

      const adminOverrideRemovals = rootsToRemove.filter(
        ({ access }) => access.requiresAdminOverride,
      );
      if (adminOverrideRemovals.length > 0) {
        const labels = adminOverrideRemovals
          .map(({ orderTest }) => this.getOrderTestLabel(orderTest))
          .join(', ');
        if (!canForceRemoveLockedTests || !forceRemoveLockedTests) {
          throw new BadRequestException(
            `Lab-admin override is required to remove these tests: ${labels}.`,
          );
        }
        if (!requestedRemovalReason) {
          throw new BadRequestException(
            'Removal reason is required when removing tests with admin override.',
          );
        }
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
      const normalizedPaymentStatus = this.normalizePaymentStatus(order.paymentStatus);
      const nextPaidAmount = this.resolveUpdatedPaidAmount(
        normalizedPaymentStatus,
        order.paidAmount != null ? Number(order.paidAmount) : null,
        order.finalAmount,
      );
      const addedRootTests = uniqueTestIds.filter((testId) => !existingRootByTestId.has(testId));
      const remainingRootStatuses = [
        ...rootOrderTests
          .filter((orderTest) => !rootIdsToRemove.includes(orderTest.id))
          .map((orderTest) => orderTest.status),
        ...addedRootTests.map(() => OrderTestStatus.PENDING),
      ];
      order.status = remainingRootStatuses.some(
        (status) => status === OrderTestStatus.PENDING || status === OrderTestStatus.IN_PROGRESS,
      )
        ? OrderStatus.REGISTERED
        : OrderStatus.COMPLETED;
      // Important: don't call save(order) here because this entity was loaded with nested
      // relations (samples/orderTests). TypeORM can try to persist stale relation graph and
      // produce invalid updates like setting order_tests.sampleId = NULL.
      await orderRepo.update(
        { id: order.id, labId },
        {
          totalAmount: order.totalAmount,
          finalAmount: order.finalAmount,
          paidAmount: nextPaidAmount,
          status: order.status,
        },
      );

      return {
        orderId: order.id,
        originalRootTests: rootOrderTests.map((orderTest) =>
          this.buildRootOrderTestAuditItem(
            orderTest,
            childOrderTestsByParent.get(orderTest.id) ?? [],
            false,
          ),
        ),
        removedRootTests: rootsToRemove.map(({ orderTest, childOrderTests, access }) =>
          this.buildRootOrderTestAuditItem(
            orderTest,
            childOrderTests,
            access.requiresAdminOverride,
          ),
        ),
        addedTests: addedRootTests
          .map((testId) => testMap.get(testId))
          .filter((test): test is Test => Boolean(test))
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
        action: AuditAction.ORDER_UPDATE,
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

  async cancelOrder(
    id: string,
    labId: string,
    actor: LabActorContext,
    reason?: string,
  ): Promise<Order> {
    const normalizedReason = reason?.trim() || null;

    const cancelResult = await this.orderRepo.manager.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const order = await orderRepo.findOne({
        where: { id, labId },
        relations: ['patient', 'lab', 'samples', 'samples.orderTests'],
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (order.status === OrderStatus.CANCELLED) {
        throw new BadRequestException('Order is already cancelled');
      }

      this.assertOrderCancellable(order);

      const rootTests = (order.samples ?? [])
        .flatMap((sample) => sample.orderTests ?? [])
        .filter((orderTest) => !orderTest.parentOrderTestId);

      await orderRepo.update(
        { id: order.id, labId },
        { status: OrderStatus.CANCELLED },
      );

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        previousStatus: order.status,
        sampleCount: order.samples?.length ?? 0,
        rootTestsCount: rootTests.length,
      };
    });

    await this.auditService.log({
      actorType: actor.actorType,
      actorId: actor.actorId,
      labId,
      userId: actor.userId,
      action: AuditAction.ORDER_CANCEL,
      entityType: 'order',
      entityId: cancelResult.orderId,
      oldValues: {
        status: cancelResult.previousStatus,
      },
      newValues: {
        status: OrderStatus.CANCELLED,
        reason: normalizedReason,
        sampleCount: cancelResult.sampleCount,
        rootTestsCount: cancelResult.rootTestsCount,
      },
      description: normalizedReason
        ? `Cancelled order ${cancelResult.orderNumber ?? cancelResult.orderId}: ${normalizedReason}`
        : `Cancelled order ${cancelResult.orderNumber ?? cancelResult.orderId}`,
    });

    return this.findOne(cancelResult.orderId, labId);
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
  ): Promise<number> {
    const allTestIds = new Set<string>();
    const panelTestIdSet = new Set<string>();
    for (const item of sampleWithTestsArr) {
      for (const t of item.tests) {
        allTestIds.add(t.id);
        if (t.type === TestType.PANEL) {
          panelTestIdSet.add(t.id);
        }
      }
    }
    const uniqueTestIds = Array.from(allTestIds);
    if (uniqueTestIds.length === 0) return 0;

    let pricingMap = precomputedPricingMap;
    if (!pricingMap) {
      pricingMap = new Map<string, number>();
      const pricingValues = await Promise.all(
        uniqueTestIds.map((testId) => this.findPricing(labId, testId, shiftId, patientType))
      );
      uniqueTestIds.forEach((id, idx) => pricingMap!.set(id, pricingValues[idx]));
    }

    const panelTestIds = Array.from(panelTestIdSet);

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

    const rows: Array<Partial<OrderTest>> = [];
    let rootTestsCount = 0;

    for (const { sampleId, tests } of sampleWithTestsArr) {
      for (const test of tests) {
        const price = pricingMap.get(test.id) ?? 0;
        rootTestsCount += 1;

        if (test.type === TestType.PANEL) {
          const parentId = randomUUID();
          rows.push({
            id: parentId,
            labId,
            sampleId,
            testId: test.id,
            parentOrderTestId: null,
            status: OrderTestStatus.PENDING,
            price,
          });

          const components = componentsByPanelId.get(test.id) ?? [];
          for (const comp of components) {
            rows.push({
              labId,
              sampleId,
              testId: comp.childTestId,
              parentOrderTestId: parentId,
              status: OrderTestStatus.PENDING,
              price: null,
              panelSortOrder: comp.sortOrder ?? null,
            });
          }
        } else {
          rows.push({
            labId,
            sampleId,
            testId: test.id,
            parentOrderTestId: null,
            status: OrderTestStatus.PENDING,
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
          .into(OrderTest)
          .values(chunk)
          .execute();
      }
    }

    return rootTestsCount;
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

  private canForceRemoveLockedTests(actor: LabActorContext, actorRole?: string): boolean {
    return (
      actor.isImpersonation ||
      actorRole === 'LAB_ADMIN' ||
      actorRole === 'SUPER_ADMIN'
    );
  }

  private getRootOrderTestRemovalAccess(
    rootOrderTest: OrderTest,
    childOrderTests: OrderTest[],
  ): RootOrderTestRemovalAccess {
    const subtree = [rootOrderTest, ...childOrderTests];
    const hasVerified = subtree.some((orderTest) => orderTest.status === OrderTestStatus.VERIFIED);
    if (hasVerified) {
      return {
        removable: true,
        requiresAdminOverride: true,
        blockedReason: null,
      };
    }

    if (rootOrderTest.status === OrderTestStatus.REJECTED) {
      return {
        removable: true,
        requiresAdminOverride: false,
        blockedReason: null,
      };
    }

    if (rootOrderTest.status === OrderTestStatus.COMPLETED) {
      return {
        removable: true,
        requiresAdminOverride: false,
        blockedReason: null,
      };
    }

    if (
      rootOrderTest.status === OrderTestStatus.IN_PROGRESS &&
      childOrderTests.length > 0
    ) {
      return {
        removable: true,
        requiresAdminOverride: true,
        blockedReason: null,
      };
    }

    if (
      rootOrderTest.status === OrderTestStatus.PENDING &&
      childOrderTests.every((orderTest) => orderTest.status === OrderTestStatus.PENDING)
    ) {
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

  private buildRootOrderTestAuditItem(
    rootOrderTest: OrderTest,
    childOrderTests: OrderTest[],
    requiresAdminOverride: boolean,
  ): RootOrderTestAuditItem {
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

  private getOrderTestLabel(orderTest: OrderTest): string {
    return orderTest.test?.code || orderTest.test?.name || orderTest.testId;
  }

  private resolveUpdatedPaidAmount(
    paymentStatus: 'unpaid' | 'partial' | 'paid',
    currentPaidAmount: number | null,
    finalAmount: number,
  ): number | null {
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

  private async findPricing(
    labId: string,
    testId: string,
    shiftId: string | null,
    patientType: PatientType,
  ): Promise<number> {
    const baseQb = this.pricingRepo
      .createQueryBuilder('pricing')
      .where('pricing.labId = :labId', { labId })
      .andWhere('pricing.testId = :testId', { testId })
      .andWhere('pricing.isActive = :isActive', { isActive: true });

    // First, prefer generic prices managed in Test Management (patientType IS NULL).
    const genericQb = baseQb.clone().andWhere('pricing.patientType IS NULL');
    if (shiftId) {
      genericQb
        .andWhere('(pricing.shiftId = :shiftId OR pricing.shiftId IS NULL)', { shiftId })
        .orderBy('CASE WHEN pricing.shiftId = :shiftId THEN 0 ELSE 1 END', 'ASC')
        .addOrderBy('pricing.createdAt', 'DESC');
    } else {
      genericQb
        .andWhere('pricing.shiftId IS NULL')
        .orderBy('pricing.createdAt', 'DESC');
    }
    genericQb.limit(1);
    const genericPricing = await genericQb.getOne();
    if (genericPricing) {
      return parseFloat(genericPricing.price.toString());
    }

    // Backward-compatible fallback for legacy patient-type specific rows.
    const specificQb = baseQb.clone().andWhere('pricing.patientType = :patientType', { patientType });
    if (shiftId) {
      specificQb
        .andWhere('(pricing.shiftId = :shiftId OR pricing.shiftId IS NULL)', { shiftId })
        .orderBy('CASE WHEN pricing.shiftId = :shiftId THEN 0 ELSE 1 END', 'ASC')
        .addOrderBy('pricing.createdAt', 'DESC');
    } else {
      specificQb
        .andWhere('pricing.shiftId IS NULL')
        .orderBy('pricing.createdAt', 'DESC');
    }
    specificQb.limit(1);
    const specificPricing = await specificQb.getOne();
    if (specificPricing) {
      return parseFloat(specificPricing.price.toString());
    }

    // Last resort: any active row for this test.
    const fallback = await this.pricingRepo.findOne({
      where: { labId, testId, isActive: true },
      order: { createdAt: 'DESC' },
    });
    return fallback ? parseFloat(fallback.price.toString()) : 0;
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
    const pattern = `^${datePrefix}[0-9]{3}$`;
    const rows = await manager.query(
      `
        SELECT COALESCE((
          SELECT MAX(CAST(SUBSTRING("orderNumber" FROM 7 FOR 3) AS integer))
          FROM "orders"
          WHERE "labId" = $1 AND "orderNumber" ~ $2
        ), 0) AS "maxSeq"
      `,
      [labId, pattern],
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
    const prices = await Promise.all(
      uniqueTestIds.map((testId) => this.findPricing(labId, testId, shiftId, patientType)),
    );
    const subtotal = prices.reduce((sum, value) => sum + value, 0);
    return { subtotal };
  }

  async getOrdersTodayCount(labId: string): Promise<number> {
    const timeZone = await this.getLabTimeZone(labId);
    const { startDate: startOfDay, endDate: endOfDay } = this.getDateRangeOrThrow(
      formatDateKeyForTimeZone(new Date(), timeZone),
      timeZone,
      'today',
    );

    const row = await this.orderRepo
      .createQueryBuilder('order')
      .select('COUNT(*)', 'count')
      .where('order.labId = :labId', { labId })
      .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
      .andWhere('order.registeredAt BETWEEN :startDate AND :endDate', {
        startDate: startOfDay,
        endDate: endOfDay,
      })
      .getRawOne<{ count: string }>();

    return parseInt(row?.count ?? '0', 10) || 0;
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
      if (order.status === OrderStatus.CANCELLED) {
        continue;
      }
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
      .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
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
        .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
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
        .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
        .andWhere('order.registeredAt BETWEEN :startDate AND :endDate', base)
        .groupBy('order.shiftId')
        .getRawMany(),
      this.orderRepo
        .createQueryBuilder('order')
        .select('COALESCE(SUM(order.finalAmount), 0)', 'revenue')
        .where('order.labId = :labId', { labId })
        .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
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
    if (params.status === OrderStatus.CANCELLED) {
      qb.andWhere('order.status = :cancelledStatus', {
        cancelledStatus: OrderStatus.CANCELLED,
      });
    } else {
      qb.andWhere('order.status != :cancelledStatus', {
        cancelledStatus: OrderStatus.CANCELLED,
      });
    }

    if (params.status && params.status !== OrderStatus.CANCELLED) {
      if (params.status === OrderStatus.COMPLETED) {
        qb.andWhere(
          `(EXISTS (
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
          ))`,
          {
            pendingStatuses: [OrderTestStatus.PENDING, OrderTestStatus.IN_PROGRESS],
          },
        );
      } else {
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

    if (params.resultStatus) {
      this.applyOrderResultStatusFilter(qb, params.resultStatus);
    }
  }

  private applyOrderResultStatusFilter(
    qb: SelectQueryBuilder<Order>,
    resultStatus: OrderResultStatus,
  ): void {
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

    qb.setParameter('resultRejected', OrderTestStatus.REJECTED);
    qb.setParameter('resultVerified', OrderTestStatus.VERIFIED);
    qb.setParameter('resultCompleted', OrderTestStatus.COMPLETED);
    qb.setParameter('completedOrVerifiedStatuses', [
      OrderTestStatus.COMPLETED,
      OrderTestStatus.VERIFIED,
    ]);

    switch (resultStatus) {
      case OrderResultStatus.REJECTED:
        qb.andWhere(hasRejectedSql);
        return;
      case OrderResultStatus.VERIFIED:
        qb.andWhere(verifiedCondition);
        return;
      case OrderResultStatus.COMPLETED:
        qb.andWhere(completedCondition);
        return;
      case OrderResultStatus.PENDING:
      default:
        qb.andWhere(pendingCondition);
        return;
    }
  }

  private async enrichOrdersWithProgress(items: OrderProgressTarget[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const orderIds = items.map((order) => order.id);
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
      .addSelect(
        `SUM(CASE WHEN ot.status IN (:...pendingStatuses) AND ot."parentOrderTestId" IS NULL THEN 1 ELSE 0 END)`,
        'pendingTests',
      )
      .addSelect(
        `SUM(CASE WHEN ot.status = :completedStatus AND ot."parentOrderTestId" IS NULL THEN 1 ELSE 0 END)`,
        'completedTests',
      )
      .addSelect(
        `SUM(CASE WHEN ot.status = :verifiedStatus AND ot."parentOrderTestId" IS NULL THEN 1 ELSE 0 END)`,
        'verifiedTests',
      )
      .addSelect(
        `SUM(CASE WHEN ot.status = :rejectedStatus AND ot."parentOrderTestId" IS NULL THEN 1 ELSE 0 END)`,
        'rejectedTests',
      )
      .from('order_tests', 'ot')
      .innerJoin('samples', 's', 's.id = ot."sampleId"')
      .where('s."orderId" IN (:...orderIds)', { orderIds })
      .setParameter('readyStatuses', [
        OrderTestStatus.COMPLETED,
        OrderTestStatus.VERIFIED,
      ])
      .setParameter('pendingStatuses', [OrderTestStatus.PENDING, OrderTestStatus.IN_PROGRESS])
      .setParameter('completedStatus', OrderTestStatus.COMPLETED)
      .setParameter('verifiedStatus', OrderTestStatus.VERIFIED)
      .setParameter('rejectedStatus', OrderTestStatus.REJECTED)
      .groupBy('s."orderId"')
      .getRawMany<{
        orderId: string;
        totalTests: string;
        readyTests: string;
        pendingTests: string;
        completedTests: string;
        verifiedTests: string;
        rejectedTests: string;
      }>();


    const countMap = new Map(
      testCounts.map((row) => [
        row.orderId,
        {
          totalTests: parseInt(row.totalTests, 10) || 0,
          readyTests: parseInt(row.readyTests, 10) || 0,
          pendingTests: parseInt(row.pendingTests, 10) || 0,
          completedTests: parseInt(row.completedTests, 10) || 0,
          verifiedTests: parseInt(row.verifiedTests, 10) || 0,
          rejectedTests: parseInt(row.rejectedTests, 10) || 0,
        },
      ]),
    );

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
      order.reportReady =
        counts.totalTests > 0 && counts.verifiedTests === counts.totalTests;
      order.resultStatus = this.normalizeOrderResultStatus(undefined, {
        testsCount: counts.totalTests,
        completedTestsCount: counts.completedTests,
        verifiedTestsCount: counts.verifiedTests,
        rejectedTestsCount: counts.rejectedTests,
      });

      if (order.status !== OrderStatus.CANCELLED) {
        if (counts.totalTests > 0 && counts.verifiedTests === counts.totalTests) {
          order.status = OrderStatus.COMPLETED;
        } else if (order.status === OrderStatus.COMPLETED) {
          order.status =
            counts.pendingTests > 0 ? OrderStatus.IN_PROGRESS : OrderStatus.REGISTERED;
        }
      }
    }
  }

  private resolveCreatePerfLogThresholdMs(): number {
    const parsed = Number.parseInt(process.env.ORDER_CREATE_PERF_LOG_THRESHOLD_MS ?? '500', 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 500;
  }

  private resolveOrderHistoryPerfLogThresholdMs(): number {
    const parsed = Number.parseInt(process.env.ORDER_HISTORY_PERF_LOG_THRESHOLD_MS ?? '500', 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 500;
  }

  private resolveOrderTestInsertChunkSize(): number {
    const parsed = Number.parseInt(process.env.ORDER_TEST_INSERT_CHUNK_SIZE ?? '250', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 250;
    }
    return Math.max(50, Math.min(parsed, 2000));
  }

  private elapsedMs(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  }

  private assertOrderNotCancelled(
    order: Pick<Order, 'status'>,
    message = 'Cancelled order cannot be edited',
  ): void {
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException(message);
    }
  }

  private assertOrderCancellable(order: Order): void {
    this.assertOrderTestsEditableToday(order);

    if (this.normalizePaymentStatus(order.paymentStatus) !== 'unpaid') {
      throw new BadRequestException('Only unpaid orders can be cancelled.');
    }
  }

  private assertOrderTestsEditableToday(order: Order): void {
    const timeZone = normalizeLabTimeZone(order.lab?.timezone);
    const todayDateKey = formatDateKeyForTimeZone(new Date(), timeZone);
    const orderDateKey = formatDateKeyForTimeZone(new Date(order.registeredAt), timeZone);
    if (orderDateKey !== todayDateKey) {
      throw new BadRequestException("Only today's orders can be edited.");
    }
  }

  /**
   * Avoid returning large lab branding blobs in order payloads.
   * These assets can be several MB and are not needed for order detail/workflow actions.
   */
  private stripHeavyOrderPayload(
    order: Order,
    detailView: OrderDetailView = OrderDetailView.COMPACT,
  ): Order {
    if (!order?.lab) {
      return detailView === OrderDetailView.COMPACT
        ? this.stripHeavyOrderTestsPayload(order)
        : order;
    }
    order.lab.reportBannerDataUrl = null;
    order.lab.reportFooterDataUrl = null;
    order.lab.reportLogoDataUrl = null;
    order.lab.reportWatermarkDataUrl = null;
    order.lab.onlineResultWatermarkDataUrl = null;
    order.lab.uiTestGroups = null;
    return detailView === OrderDetailView.COMPACT
      ? this.stripHeavyOrderTestsPayload(order)
      : order;
  }

  /**
   * Order details page/printing only needs compact test identity fields.
   * Remove bulky test metadata JSON/ranges from nested order payloads.
   */
  private stripHeavyOrderTestsPayload(order: Order): Order {
    for (const sample of order.samples ?? []) {
      for (const orderTest of sample.orderTests ?? []) {
        orderTest.flag = normalizeOrderTestFlag(orderTest.flag ?? null);
        const testPayload = orderTest.test as unknown as Record<string, unknown> | undefined;
        if (!testPayload) continue;
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

  private normalizeDeliveryMethods(
    values: unknown[] | null | undefined,
  ): DeliveryMethod[] {
    if (!Array.isArray(values) || values.length === 0) {
      return [];
    }

    const stableOrder: DeliveryMethod[] = [
      DeliveryMethod.PRINT,
      DeliveryMethod.WHATSAPP,
      DeliveryMethod.VIBER,
    ];
    const allowed = new Set(stableOrder);
    const selected = new Set<DeliveryMethod>();

    for (const raw of values) {
      if (typeof raw !== 'string') continue;
      const normalized = raw.trim().toUpperCase();
      if (!normalized) continue;
      if (!allowed.has(normalized as DeliveryMethod)) continue;
      selected.add(normalized as DeliveryMethod);
      if (selected.size >= 3) break;
    }

    return stableOrder.filter((method) => selected.has(method));
  }

  private normalizePaymentStatus(value: string | null | undefined): 'unpaid' | 'partial' | 'paid' {
    if (value === 'paid') return 'paid';
    if (value === 'partial') return 'partial';
    return 'unpaid';
  }

  private normalizeOrderResultStatus(
    value: unknown,
    counts: {
      testsCount: number;
      completedTestsCount: number;
      verifiedTestsCount: number;
      rejectedTestsCount: number;
    },
  ): OrderResultStatus {
    if (value === OrderResultStatus.PENDING) return OrderResultStatus.PENDING;
    if (value === OrderResultStatus.COMPLETED) return OrderResultStatus.COMPLETED;
    if (value === OrderResultStatus.VERIFIED) return OrderResultStatus.VERIFIED;
    if (value === OrderResultStatus.REJECTED) return OrderResultStatus.REJECTED;

    if (counts.rejectedTestsCount > 0) {
      return OrderResultStatus.REJECTED;
    }
    if (counts.testsCount > 0 && counts.verifiedTestsCount === counts.testsCount) {
      return OrderResultStatus.VERIFIED;
    }
    if (
      counts.completedTestsCount > 0 &&
      counts.completedTestsCount + counts.verifiedTestsCount === counts.testsCount
    ) {
      return OrderResultStatus.COMPLETED;
    }
    return OrderResultStatus.PENDING;
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
      orders = orders.map((order) => this.stripHeavyOrderPayload(order));
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
