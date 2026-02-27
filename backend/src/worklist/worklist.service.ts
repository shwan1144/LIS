import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, SelectQueryBuilder } from 'typeorm';
import { OrderTest, OrderTestStatus, ResultFlag } from '../entities/order-test.entity';
import { Order } from '../entities/order.entity';
import { Test } from '../entities/test.entity';
import { Lab } from '../entities/lab.entity';
import { UserDepartmentAssignment } from '../entities/user-department-assignment.entity';
import { Department } from '../entities/department.entity';
import type {
  TestParameterDefinition,
  TestResultEntryType,
  TestResultTextOption,
} from '../entities/test.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../entities/audit-log.entity';
import { OrderStatus } from '../entities/order.entity';
import { PanelStatusService } from '../panels/panel-status.service';
import { LabActorContext } from '../types/lab-actor-context';
import { resolveNumericRange } from '../tests/normal-range.util';
import type { TestNumericAgeRange } from '../entities/test.entity';
import {
  formatDateKeyForTimeZone,
  getUtcRangeForLabDate,
  normalizeLabTimeZone,
} from '../database/lab-timezone.util';

export interface WorklistItem {
  id: string;
  orderNumber: string;
  patientName: string;
  patientSex: string | null;
  patientAge: number | null;
  testCode: string;
  testName: string;
  testType: 'SINGLE' | 'PANEL';
  testUnit: string | null;
  normalMin: number | null;
  normalMax: number | null;
  normalText: string | null;
  resultEntryType: TestResultEntryType;
  resultTextOptions: TestResultTextOption[] | null;
  allowCustomResultText: boolean;
  tubeType: string | null;
  status: OrderTestStatus;
  resultValue: number | null;
  resultText: string | null;
  flag: ResultFlag | null;
  resultedAt: Date | null;
  resultedBy: string | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  registeredAt: Date;
  orderId: string;
  sampleId: string;
  parentOrderTestId: string | null;
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  parameterDefinitions: TestParameterDefinition[] | null;
  resultParameters: Record<string, string> | null;
  rejectionReason: string | null;
  panelSortOrder: number | null;
}

function parseJsonField(val: unknown): unknown {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val || 'null');
    } catch {
      return null;
    }
  }
  return null;
}

@Injectable()
export class WorklistService {
  constructor(
    @InjectRepository(OrderTest)
    private readonly orderTestRepo: Repository<OrderTest>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Test)
    private readonly testRepo: Repository<Test>,
    @InjectRepository(Lab)
    private readonly labRepo: Repository<Lab>,
    @InjectRepository(UserDepartmentAssignment)
    private readonly userDeptRepo: Repository<UserDepartmentAssignment>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    private readonly panelStatusService: PanelStatusService,
    private readonly auditService: AuditService,
  ) { }

  async getWorklist(
    labId: string,
    params: {
      status?: OrderTestStatus[];
      search?: string;
      date?: string;
      departmentId?: string;
      page?: number;
      size?: number;
    },
    userId?: string,
  ): Promise<{ items: WorklistItem[]; total: number }> {
    const page = Math.max(1, params.page ?? 1);
    const size = Math.min(100, Math.max(1, params.size ?? 50));
    const skip = (page - 1) * size;

    // Default to active work queue plus rejected tests needing re-entry.
    const statuses = params.status?.length
      ? params.status
      : [OrderTestStatus.PENDING, OrderTestStatus.COMPLETED, OrderTestStatus.REJECTED];

    // User department restriction: if user has department assignments for this lab, restrict worklist
    let allowedDepartmentIds: string[] | null = null;
    if (userId) {
      const assignments = await this.userDeptRepo.find({
        where: { userId },
        relations: ['department'],
      });
      const forLab = assignments
        .filter((a) => a.department?.labId === labId)
        .map((a) => a.departmentId);
      if (forLab.length > 0) allowedDepartmentIds = forLab;
    }

    let startDate: Date | null = null;
    let endDate: Date | null = null;
    if (params.date) {
      const labTimeZone = await this.getLabTimeZone(labId);
      const dateRange = this.getDateRangeOrThrow(params.date, labTimeZone, 'date');
      startDate = dateRange.startDate;
      endDate = dateRange.endDate;
    }

    const buildBaseQuery = (): SelectQueryBuilder<OrderTest> => {
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
        qb.andWhere(
          '(order.orderNumber ILIKE :term OR patient.fullName ILIKE :term OR patient.patientNumber = :exactSearch OR test.code ILIKE :term)',
          { term, exactSearch },
        );
      }

      return qb;
    };

    const totalRaw = await buildBaseQuery()
      .select('COUNT(DISTINCT order.id)', 'count')
      .getRawOne<{ count: string }>();
    const total = Number(totalRaw?.count ?? 0);

    const orderRows = await buildBaseQuery()
      .select('order.id', 'orderId')
      .addSelect('MAX(order.registeredAt)', 'registeredAt')
      .addSelect(
        'MIN(CASE WHEN ot.status = :rejectedStatus THEN 0 ELSE 1 END)',
        'rejectedPriority',
      )
      .setParameter('rejectedStatus', OrderTestStatus.REJECTED)
      .groupBy('order.id')
      .orderBy('"rejectedPriority"', 'ASC')
      .addOrderBy('"registeredAt"', 'DESC')
      .offset(skip)
      .limit(size)
      .getRawMany<{ orderId: string }>();

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
      .orderBy(
        'CASE WHEN ot.status = :rejectedStatus THEN 0 ELSE 1 END',
        'ASC',
      )
      .addOrderBy('order.registeredAt', 'DESC')
      .addOrderBy('ot.panelSortOrder', 'ASC', 'NULLS LAST')
      .addOrderBy('test.sortOrder', 'ASC')
      .addOrderBy('test.code', 'ASC')
      .setParameter('rejectedStatus', OrderTestStatus.REJECTED)
      .getRawMany();

    // Process items to calculate age and resolve normal ranges by age+sex.
    const items: WorklistItem[] = rawItems.map((item) => {
      // Calculate age
      const patientAge = this.computePatientAgeYears(item.patientDob);
      const numericAgeRanges =
        (parseJsonField(item.numericAgeRanges) as TestNumericAgeRange[] | null) ??
        null;
      const resolvedRange = resolveNumericRange(
        {
          normalMin: item.normalMin,
          normalMax: item.normalMax,
          normalMinMale: item.normalMinMale,
          normalMaxMale: item.normalMaxMale,
          normalMinFemale: item.normalMinFemale,
          normalMaxFemale: item.normalMaxFemale,
          numericAgeRanges,
        },
        item.patientSex,
        patientAge,
      );

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
        resultTextOptions:
          (parseJsonField(item.resultTextOptions) as TestResultTextOption[] | null) ??
          null,
        allowCustomResultText: Boolean(item.allowCustomResultText),
        tubeType: item.tubeType,
        status: item.status,
        resultValue:
          item.resultValue !== null && item.resultValue !== undefined
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
        parameterDefinitions: (parseJsonField(item.parameterDefinitions) as TestParameterDefinition[] | null) ?? null,
        resultParameters: (parseJsonField(item.resultParameters) as Record<string, string> | null) ?? null,
        rejectionReason: item.rejectionReason ?? null,
        panelSortOrder: item.panelSortOrder != null ? Number(item.panelSortOrder) : null,
      };
    });

    return { items, total };
  }

  async enterResult(
    orderTestId: string,
    labId: string,
    actor: LabActorContext,
    data: {
      resultValue?: number | null;
      resultText?: string | null;
      comments?: string | null;
      resultParameters?: Record<string, string> | null;
      forceEditVerified?: boolean;
    },
    actorRole?: string,
  ): Promise<OrderTest> {
    const orderTest = await this.orderTestRepo.findOne({
      where: { id: orderTestId },
      relations: ['sample', 'sample.order', 'sample.order.patient', 'test'],
    });

    if (!orderTest) {
      throw new NotFoundException('Order test not found');
    }

    if (orderTest.sample.order.labId !== labId) {
      throw new NotFoundException('Order test not found');
    }

    const forceEditVerified = data.forceEditVerified === true;
    const canForceEditVerified =
      actor.isImpersonation ||
      actorRole === 'LAB_ADMIN' ||
      actorRole === 'SUPER_ADMIN';
    const isVerifiedOverride =
      orderTest.status === OrderTestStatus.VERIFIED &&
      forceEditVerified &&
      canForceEditVerified;

    if (orderTest.status === OrderTestStatus.VERIFIED && !isVerifiedOverride) {
      throw new BadRequestException('Cannot modify a verified result');
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

    const resultEntryType = this.normalizeResultEntryType(
      orderTest.test.resultEntryType,
    );
    const resultTextOptions = this.normalizeResultTextOptions(
      orderTest.test.resultTextOptions,
    );
    const normalizedResultTextInput =
      data.resultText !== undefined
        ? this.normalizeResultText(data.resultText)
        : undefined;

    if (resultEntryType === 'QUALITATIVE') {
      const candidateText =
        normalizedResultTextInput ?? this.normalizeResultText(orderTest.resultText);
      if (!candidateText) {
        throw new BadRequestException(
          'Result text is required for qualitative tests',
        );
      }

      const matchedOption = this.findMatchingResultTextOption(
        candidateText,
        resultTextOptions,
      );
      if (!matchedOption && !orderTest.test.allowCustomResultText) {
        const allowedValues = (resultTextOptions ?? [])
          .map((option) => option.value)
          .join(', ');
        throw new BadRequestException(
          allowedValues.length
            ? `Result must be one of: ${allowedValues}`
            : 'No qualitative options are configured for this test',
        );
      }

      orderTest.resultText = matchedOption?.value ?? candidateText;
      orderTest.resultValue = null;
      orderTest.flag = this.toResultFlag(matchedOption?.flag ?? null);
    } else if (resultEntryType === 'TEXT') {
      if (data.resultText !== undefined) {
        orderTest.resultText = normalizedResultTextInput ?? null;
      }
      orderTest.resultValue = null;
      orderTest.flag = this.resolveFlagFromResultText(
        orderTest.resultText,
        resultTextOptions,
      );
    } else {
      if (data.resultText !== undefined) {
        orderTest.resultText = normalizedResultTextInput ?? null;
      }

      const optionFlag = this.resolveFlagFromResultText(
        orderTest.resultText,
        resultTextOptions,
      );
      if (optionFlag) {
        orderTest.flag = optionFlag;
      } else {
        // Calculate numeric flag based on normal range
        const patientAgeYears = this.computePatientAgeYears(
          orderTest.sample.order.patient?.dateOfBirth ?? null,
        );
        orderTest.flag = this.calculateFlag(
          orderTest.resultValue,
          orderTest.test,
          orderTest.sample.order.patient?.sex || null,
          patientAgeYears,
        );
      }
    }

    // Update status and timestamp
    const isUpdate = orderTest.resultedAt !== null;
    orderTest.status = isVerifiedOverride
      ? OrderTestStatus.VERIFIED
      : OrderTestStatus.COMPLETED;
    // Re-entry after rejection should clear the old rejection reason.
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

    // Audit log
    const impersonationAudit =
      actor.isImpersonation && actor.platformUserId
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
      action: isUpdate ? AuditAction.RESULT_UPDATE : AuditAction.RESULT_ENTER,
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

  async batchEnterResults(
    labId: string,
    actor: LabActorContext,
    actorRole: string | undefined,
    updates: Array<{
      orderTestId: string;
      resultValue?: number | null;
      resultText?: string | null;
      comments?: string | null;
      resultParameters?: Record<string, string> | null;
      forceEditVerified?: boolean;
    }>,
  ): Promise<OrderTest[]> {
    if (!updates.length) return [];

    const orderTestIds = updates.map((u) => u.orderTestId);
    const orderTests = await this.orderTestRepo.find({
      where: { id: In(orderTestIds) },
      relations: ['sample', 'sample.order', 'sample.order.patient', 'test'],
    });

    const orderTestsMap = new Map(orderTests.map((ot) => [ot.id, ot]));
    const toSave: OrderTest[] = [];
    const updatedOrderIds = new Set<string>();
    const updatedParentIds = new Set<string>();
    const auditLogs: any[] = [];

    for (const data of updates) {
      const orderTest = orderTestsMap.get(data.orderTestId);
      if (!orderTest || orderTest.sample.order.labId !== labId) {
        continue;
      }

      const forceEditVerified = data.forceEditVerified === true;
      const canForceEditVerified =
        actor.isImpersonation || actorRole === 'LAB_ADMIN' || actorRole === 'SUPER_ADMIN';
      const isVerifiedOverride =
        orderTest.status === OrderTestStatus.VERIFIED && forceEditVerified && canForceEditVerified;

      if (orderTest.status === OrderTestStatus.VERIFIED && !isVerifiedOverride) {
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
      const normalizedResultTextInput =
        data.resultText !== undefined ? this.normalizeResultText(data.resultText) : undefined;

      if (resultEntryType === 'QUALITATIVE') {
        const candidateText =
          normalizedResultTextInput ?? this.normalizeResultText(orderTest.resultText);
        if (!candidateText) continue;

        const matchedOption = this.findMatchingResultTextOption(candidateText, resultTextOptions);
        if (!matchedOption && !orderTest.test.allowCustomResultText) continue;

        orderTest.resultText = matchedOption?.value ?? candidateText;
        orderTest.resultValue = null;
        orderTest.flag = this.toResultFlag(matchedOption?.flag ?? null);
      } else if (resultEntryType === 'TEXT') {
        if (data.resultText !== undefined) {
          orderTest.resultText = normalizedResultTextInput ?? null;
        }
        orderTest.resultValue = null;
        orderTest.flag = this.resolveFlagFromResultText(orderTest.resultText, resultTextOptions);
      } else {
        if (data.resultText !== undefined) {
          orderTest.resultText = normalizedResultTextInput ?? null;
        }

        const optionFlag = this.resolveFlagFromResultText(orderTest.resultText, resultTextOptions);
        if (optionFlag) {
          orderTest.flag = optionFlag;
        } else {
          const patientAgeYears = this.computePatientAgeYears(
            orderTest.sample.order.patient?.dateOfBirth ?? null,
          );
          orderTest.flag = this.calculateFlag(
            orderTest.resultValue,
            orderTest.test,
            orderTest.sample.order.patient?.sex || null,
            patientAgeYears,
          );
        }
      }

      const isUpdate = orderTest.resultedAt !== null;
      orderTest.status = isVerifiedOverride ? OrderTestStatus.VERIFIED : OrderTestStatus.COMPLETED;
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

      const impersonationAudit =
        actor.isImpersonation && actor.platformUserId
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
        action: isUpdate ? AuditAction.RESULT_UPDATE : AuditAction.RESULT_ENTER,
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

  async verifyResult(
    orderTestId: string,
    labId: string,
    actor: LabActorContext,
  ): Promise<OrderTest> {
    const orderTest = await this.orderTestRepo.findOne({
      where: { id: orderTestId },
      relations: ['sample', 'sample.order', 'test'],
    });

    if (!orderTest) {
      throw new NotFoundException('Order test not found');
    }

    if (orderTest.sample.order.labId !== labId) {
      throw new NotFoundException('Order test not found');
    }

    if (orderTest.status === OrderTestStatus.VERIFIED) {
      throw new BadRequestException('Result is already verified');
    }

    if (orderTest.status === OrderTestStatus.PENDING) {
      throw new BadRequestException('Cannot verify a test without a result');
    }

    orderTest.status = OrderTestStatus.VERIFIED;
    orderTest.verifiedAt = new Date();
    orderTest.verifiedBy = actor.userId;

    const saved = await this.orderTestRepo.save(orderTest);
    await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
    await this.syncOrderStatus(orderTest.sample.orderId);

    // Audit log
    const impersonationAudit =
      actor.isImpersonation && actor.platformUserId
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
      action: AuditAction.RESULT_VERIFY,
      entityType: 'order_test',
      entityId: orderTestId,
      newValues: {
        resultValue: orderTest.resultValue,
        resultText: orderTest.resultText,
        flag: orderTest.flag,
        status: OrderTestStatus.VERIFIED,
        ...impersonationAudit,
      },
      description: `Verified result for test ${orderTest.test?.code || orderTestId}`,
    });

    return saved;
  }

  async verifyMultiple(
    orderTestIds: string[],
    labId: string,
    actor: LabActorContext,
  ): Promise<{ verified: number; failed: number }> {
    if (!orderTestIds.length) return { verified: 0, failed: 0 };

    const orderTests = await this.orderTestRepo.find({
      where: { id: In(orderTestIds) },
      relations: ['sample', 'sample.order', 'test'],
    });

    const toSave: OrderTest[] = [];
    const updatedOrderIds = new Set<string>();
    const updatedParentIds = new Set<string>();
    const auditLogs: any[] = [];
    let failed = 0;

    for (const ot of orderTests) {
      if (ot.sample.order.labId !== labId || ot.status === OrderTestStatus.VERIFIED || ot.status === OrderTestStatus.PENDING) {
        failed++;
        continue;
      }

      ot.status = OrderTestStatus.VERIFIED;
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
        action: AuditAction.RESULT_VERIFY,
        entityType: 'order_test',
        entityId: ot.id,
        newValues: {
          resultValue: ot.resultValue,
          resultText: ot.resultText,
          flag: ot.flag,
          status: OrderTestStatus.VERIFIED,
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

  async rejectResult(
    orderTestId: string,
    labId: string,
    actor: LabActorContext,
    reason: string,
  ): Promise<OrderTest> {
    const orderTest = await this.orderTestRepo.findOne({
      where: { id: orderTestId },
      relations: ['sample', 'sample.order'],
    });

    if (!orderTest) {
      throw new NotFoundException('Order test not found');
    }

    if (orderTest.sample.order.labId !== labId) {
      throw new NotFoundException('Order test not found');
    }

    if (orderTest.status === OrderTestStatus.VERIFIED) {
      throw new BadRequestException('Cannot reject a verified result');
    }

    orderTest.status = OrderTestStatus.REJECTED;
    orderTest.rejectionReason = reason;
    orderTest.verifiedAt = new Date();
    orderTest.verifiedBy = actor.userId;

    const saved = await this.orderTestRepo.save(orderTest);
    await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
    await this.syncOrderStatus(orderTest.sample.orderId);

    // Audit log
    const impersonationAudit =
      actor.isImpersonation && actor.platformUserId
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
      action: AuditAction.RESULT_REJECT,
      entityType: 'order_test',
      entityId: orderTestId,
      newValues: {
        status: OrderTestStatus.REJECTED,
        rejectionReason: reason,
        ...impersonationAudit,
      },
      description: `Rejected result: ${reason}`,
    });

    return saved;
  }

  private normalizeResultEntryType(
    value: string | null | undefined,
  ): TestResultEntryType {
    const normalized = String(value || 'NUMERIC').trim().toUpperCase();
    if (
      normalized === 'NUMERIC' ||
      normalized === 'QUALITATIVE' ||
      normalized === 'TEXT'
    ) {
      return normalized;
    }
    return 'NUMERIC';
  }

  private normalizeResultText(
    value: string | null | undefined,
  ): string | null {
    const normalized = String(value ?? '').trim();
    return normalized.length ? normalized : null;
  }

  private normalizeResultTextOptions(
    options: TestResultTextOption[] | null | undefined,
  ): TestResultTextOption[] | null {
    if (!options || !Array.isArray(options)) return null;
    const normalized = options
      .map((option) => ({
        value: this.normalizeResultText(option?.value),
        flag: this.toResultFlag(option?.flag ?? null),
        isDefault: Boolean(option?.isDefault),
      }))
      .filter(
        (option): option is {
          value: string;
          flag: ResultFlag | null;
          isDefault: boolean;
        } => Boolean(option.value),
      )
      .map((option) => ({
        value: option.value,
        flag: option.flag,
        isDefault: option.isDefault,
      }));

    return normalized.length ? normalized : null;
  }

  private findMatchingResultTextOption(
    text: string,
    options: TestResultTextOption[] | null,
  ): TestResultTextOption | null {
    if (!options?.length) return null;
    const candidate = text.trim().toLowerCase();
    return (
      options.find((option) => option.value.trim().toLowerCase() === candidate) ??
      null
    );
  }

  private resolveFlagFromResultText(
    resultText: string | null,
    options: TestResultTextOption[] | null,
  ): ResultFlag | null {
    if (!resultText || !options?.length) return null;
    const matched = this.findMatchingResultTextOption(resultText, options);
    return this.toResultFlag(matched?.flag ?? null);
  }

  private toResultFlag(flag: string | null | undefined): ResultFlag | null {
    const normalized = String(flag ?? '').trim().toUpperCase();
    if (!normalized) return null;
    if (normalized === ResultFlag.NORMAL) return ResultFlag.NORMAL;
    if (normalized === ResultFlag.HIGH) return ResultFlag.HIGH;
    if (normalized === ResultFlag.LOW) return ResultFlag.LOW;
    if (normalized === ResultFlag.CRITICAL_HIGH) return ResultFlag.CRITICAL_HIGH;
    if (normalized === ResultFlag.CRITICAL_LOW) return ResultFlag.CRITICAL_LOW;
    if (normalized === ResultFlag.POSITIVE) return ResultFlag.POSITIVE;
    if (normalized === ResultFlag.NEGATIVE) return ResultFlag.NEGATIVE;
    if (normalized === ResultFlag.ABNORMAL) return ResultFlag.ABNORMAL;
    return null;
  }

  private calculateFlag(
    resultValue: number | null,
    test: Test,
    patientSex: string | null,
    patientAgeYears: number | null,
  ): ResultFlag | null {
    if (resultValue === null) return null;

    const { normalMin, normalMax } = resolveNumericRange(
      test,
      patientSex,
      patientAgeYears,
    );

    // No range defined
    if (normalMin === null && normalMax === null) {
      return null;
    }

    // Check flag
    if (normalMax !== null && resultValue > parseFloat(normalMax.toString())) {
      // Check for critical high (e.g., 2x the upper limit)
      const criticalThreshold = parseFloat(normalMax.toString()) * 1.5;
      if (resultValue > criticalThreshold) {
        return ResultFlag.CRITICAL_HIGH;
      }
      return ResultFlag.HIGH;
    }

    if (normalMin !== null && resultValue < parseFloat(normalMin.toString())) {
      // Check for critical low (e.g., 50% of lower limit)
      const criticalThreshold = parseFloat(normalMin.toString()) * 0.5;
      if (resultValue < criticalThreshold) {
        return ResultFlag.CRITICAL_LOW;
      }
      return ResultFlag.LOW;
    }

    return ResultFlag.NORMAL;
  }

  private computePatientAgeYears(
    dateOfBirth: string | Date | null | undefined,
  ): number | null {
    if (!dateOfBirth) return null;
    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age < 0 ? null : age;
  }

  async getWorklistStats(labId: string): Promise<{
    pending: number;
    completed: number;
    verified: number;
    rejected: number;
  }> {
    const labTimeZone = await this.getLabTimeZone(labId);
    const todayDateKey = formatDateKeyForTimeZone(new Date(), labTimeZone);
    const { startDate: today, endExclusive: tomorrow } = getUtcRangeForLabDate(
      todayDateKey,
      labTimeZone,
    );

    const qb = this.orderTestRepo
      .createQueryBuilder('ot')
      .innerJoin('ot.sample', 'sample')
      .innerJoin('sample.order', 'order')
      .where('order.labId = :labId', { labId })
      .andWhere('order.registeredAt >= :today', { today })
      .andWhere('order.registeredAt < :tomorrow', { tomorrow })
      // Exclude panel child rows — count each panel as one test, not 1 + N children.
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
        case OrderTestStatus.PENDING:
        case OrderTestStatus.IN_PROGRESS:
          stats.pending += count;
          break;
        case OrderTestStatus.COMPLETED:
          stats.completed += count;
          break;
        case OrderTestStatus.VERIFIED:
          stats.verified += count;
          break;
        case OrderTestStatus.REJECTED:
          stats.rejected += count;
          break;
      }
    }

    return stats;
  }

  private async getLabTimeZone(labId: string): Promise<string> {
    const lab = await this.labRepo.findOne({ where: { id: labId } });
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

  private async syncOrderStatus(orderId: string): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order || order.status === OrderStatus.CANCELLED) {
      return;
    }

    const tests = await this.orderTestRepo
      .createQueryBuilder('ot')
      .innerJoin('ot.sample', 'sample')
      .where('sample.orderId = :orderId', { orderId })
      .select(['ot.id AS id', 'ot.status AS status'])
      .getRawMany<{ id: string; status: OrderTestStatus }>();

    if (tests.length === 0) {
      return;
    }

    const statuses = tests.map((t) => t.status);
    const allFinalized = statuses.every(
      (s) => s === OrderTestStatus.VERIFIED || s === OrderTestStatus.REJECTED,
    );

    // Requirement: when all tests are data-entered and verified (or rejected),
    // mark the order as COMPLETED so it appears in Reports by default
    const nextStatus = allFinalized ? OrderStatus.COMPLETED : OrderStatus.REGISTERED;

    if (order.status !== nextStatus) {
      order.status = nextStatus;
      await this.orderRepo.save(order);
    }
  }
}
