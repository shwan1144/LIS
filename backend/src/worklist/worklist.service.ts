import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { OrderTest, OrderTestStatus, ResultFlag } from '../entities/order-test.entity';
import { Order } from '../entities/order.entity';
import { Test } from '../entities/test.entity';
import { UserDepartmentAssignment } from '../entities/user-department-assignment.entity';
import { Department } from '../entities/department.entity';
import type { TestParameterDefinition } from '../entities/test.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../entities/audit-log.entity';
import { OrderStatus } from '../entities/order.entity';
import { PanelStatusService } from '../panels/panel-status.service';

export interface WorklistItem {
  id: string;
  orderNumber: string;
  patientName: string;
  patientSex: string | null;
  patientAge: number | null;
  testCode: string;
  testName: string;
  testUnit: string | null;
  normalMin: number | null;
  normalMax: number | null;
  normalText: string | null;
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
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  parameterDefinitions: TestParameterDefinition[] | null;
  resultParameters: Record<string, string> | null;
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
    @InjectRepository(UserDepartmentAssignment)
    private readonly userDeptRepo: Repository<UserDepartmentAssignment>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    private readonly panelStatusService: PanelStatusService,
    private readonly auditService: AuditService,
  ) {}

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

    // Default to PENDING and COMPLETED (not yet verified)
    const statuses = params.status?.length
      ? params.status
      : [OrderTestStatus.PENDING, OrderTestStatus.COMPLETED];

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

    // Filter by date
    if (params.date) {
      const startDate = new Date(params.date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(params.date);
      endDate.setHours(23, 59, 59, 999);
      qb.andWhere('order.registeredAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    // Search by patient name, patient ID, or order number
    if (params.search?.trim()) {
      const term = `%${params.search.trim()}%`;
      const exactSearch = params.search.trim();
      qb.andWhere(
        '(order.orderNumber ILIKE :term OR patient.fullName ILIKE :term OR patient.patientNumber = :exactSearch OR test.code ILIKE :term)',
        { term, exactSearch },
      );
    }

    qb.select([
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
      'test.normalText AS "normalText"',
      'ot.status AS status',
      'ot.resultValue AS "resultValue"',
      'ot.resultText AS "resultText"',
      'ot.resultParameters AS "resultParameters"',
      'ot.flag AS flag',
      'ot.resultedAt AS "resultedAt"',
      'ot.resultedBy AS "resultedBy"',
      'ot.verifiedAt AS "verifiedAt"',
      'ot.verifiedBy AS "verifiedBy"',
      'test.parameterDefinitions AS "parameterDefinitions"',
    ])
    .orderBy('order.registeredAt', 'ASC')
    .addOrderBy('test.sortOrder', 'ASC')
    .addOrderBy('test.code', 'ASC');

    const total = await qb.getCount();
    const rawItems = await qb.offset(skip).limit(size).getRawMany();

    // Process items to calculate age and correct normal ranges based on gender
    const items: WorklistItem[] = rawItems.map((item) => {
      let normalMin = item.normalMin ? parseFloat(item.normalMin) : null;
      let normalMax = item.normalMax ? parseFloat(item.normalMax) : null;

      // Use gender-specific ranges if available
      if (item.patientSex === 'M') {
        if (item.normalMinMale !== null) normalMin = parseFloat(item.normalMinMale);
        if (item.normalMaxMale !== null) normalMax = parseFloat(item.normalMaxMale);
      } else if (item.patientSex === 'F') {
        if (item.normalMinFemale !== null) normalMin = parseFloat(item.normalMinFemale);
        if (item.normalMaxFemale !== null) normalMax = parseFloat(item.normalMaxFemale);
      }

      // Calculate age
      let patientAge: number | null = null;
      if (item.patientDob) {
        const dob = new Date(item.patientDob);
        const today = new Date();
        patientAge = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
          patientAge--;
        }
      }

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
        testUnit: item.testUnit,
        normalMin,
        normalMax,
        normalText: item.normalText,
        tubeType: item.tubeType,
        status: item.status,
        resultValue: item.resultValue ? parseFloat(item.resultValue) : null,
        resultText: item.resultText,
        flag: item.flag,
        resultedAt: item.resultedAt,
        resultedBy: item.resultedBy ?? null,
        verifiedAt: item.verifiedAt,
        verifiedBy: item.verifiedBy ?? null,
        registeredAt: item.registeredAt,
        departmentId: item.departmentId ?? null,
        departmentCode: item.departmentCode ?? null,
        departmentName: item.departmentName ?? null,
        parameterDefinitions: (parseJsonField(item.parameterDefinitions) as TestParameterDefinition[] | null) ?? null,
        resultParameters: (parseJsonField(item.resultParameters) as Record<string, string> | null) ?? null,
      };
    });

    return { items, total };
  }

  async enterResult(
    orderTestId: string,
    labId: string,
    userId: string,
    data: {
      resultValue?: number | null;
      resultText?: string | null;
      comments?: string | null;
      resultParameters?: Record<string, string> | null;
    },
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
      throw new BadRequestException('Cannot modify a verified result');
    }

    // Update result
    if (data.resultValue !== undefined) {
      orderTest.resultValue = data.resultValue;
    }
    if (data.resultText !== undefined) {
      orderTest.resultText = data.resultText || null;
    }
    if (data.comments !== undefined) {
      orderTest.comments = data.comments || null;
    }
    if (data.resultParameters !== undefined) {
      orderTest.resultParameters = data.resultParameters && Object.keys(data.resultParameters).length > 0
        ? data.resultParameters
        : null;
    }

    // Calculate flag based on normal range
    orderTest.flag = this.calculateFlag(
      orderTest.resultValue,
      orderTest.test,
      orderTest.sample.order.patient?.sex || null,
    );

    // Update status and timestamp
    const isUpdate = orderTest.resultedAt !== null;
    orderTest.status = OrderTestStatus.COMPLETED;
    orderTest.resultedAt = new Date();
    orderTest.resultedBy = userId;

    const saved = await this.orderTestRepo.save(orderTest);
    await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
    await this.syncOrderStatus(orderTest.sample.orderId);

    // Audit log
    await this.auditService.log({
      labId,
      userId,
      action: isUpdate ? AuditAction.RESULT_UPDATE : AuditAction.RESULT_ENTER,
      entityType: 'order_test',
      entityId: orderTestId,
      newValues: {
        resultValue: data.resultValue,
        resultText: data.resultText,
        flag: orderTest.flag,
      },
      description: `${isUpdate ? 'Updated' : 'Entered'} result for test ${orderTest.test?.code || orderTestId}`,
    });

    return saved;
  }

  async verifyResult(
    orderTestId: string,
    labId: string,
    userId: string,
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
    orderTest.verifiedBy = userId;

    const saved = await this.orderTestRepo.save(orderTest);
    await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
    await this.syncOrderStatus(orderTest.sample.orderId);

    // Audit log
    await this.auditService.log({
      labId,
      userId,
      action: AuditAction.RESULT_VERIFY,
      entityType: 'order_test',
      entityId: orderTestId,
      newValues: {
        resultValue: orderTest.resultValue,
        resultText: orderTest.resultText,
        flag: orderTest.flag,
        status: OrderTestStatus.VERIFIED,
      },
      description: `Verified result for test ${orderTest.test?.code || orderTestId}`,
    });

    return saved;
  }

  async verifyMultiple(
    orderTestIds: string[],
    labId: string,
    userId: string,
  ): Promise<{ verified: number; failed: number }> {
    let verified = 0;
    let failed = 0;

    for (const id of orderTestIds) {
      try {
        await this.verifyResult(id, labId, userId);
        verified++;
      } catch {
        failed++;
      }
    }

    return { verified, failed };
  }

  async rejectResult(
    orderTestId: string,
    labId: string,
    userId: string,
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
    orderTest.verifiedBy = userId;

    const saved = await this.orderTestRepo.save(orderTest);
    await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
    await this.syncOrderStatus(orderTest.sample.orderId);

    // Audit log
    await this.auditService.log({
      labId,
      userId,
      action: AuditAction.RESULT_REJECT,
      entityType: 'order_test',
      entityId: orderTestId,
      newValues: {
        status: OrderTestStatus.REJECTED,
        rejectionReason: reason,
      },
      description: `Rejected result: ${reason}`,
    });

    return saved;
  }

  private calculateFlag(
    resultValue: number | null,
    test: Test,
    patientSex: string | null,
  ): ResultFlag | null {
    if (resultValue === null) return null;

    // Get appropriate normal range
    let normalMin = test.normalMin;
    let normalMax = test.normalMax;

    if (patientSex === 'M') {
      if (test.normalMinMale !== null) normalMin = test.normalMinMale;
      if (test.normalMaxMale !== null) normalMax = test.normalMaxMale;
    } else if (patientSex === 'F') {
      if (test.normalMinFemale !== null) normalMin = test.normalMinFemale;
      if (test.normalMaxFemale !== null) normalMax = test.normalMaxFemale;
    }

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

  async getWorklistStats(labId: string): Promise<{
    pending: number;
    completed: number;
    verified: number;
    rejected: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const qb = this.orderTestRepo
      .createQueryBuilder('ot')
      .innerJoin('ot.sample', 'sample')
      .innerJoin('sample.order', 'order')
      .where('order.labId = :labId', { labId })
      .andWhere('order.registeredAt >= :today', { today })
      .andWhere('order.registeredAt < :tomorrow', { tomorrow })
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
