import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { RlsSessionService } from '../database/rls-session.service';
import { AuditAction, AuditActorType } from '../entities/audit-log.entity';
import { Lab } from '../entities/lab.entity';
import {
  Order,
  OrderStatus,
  PatientType,
} from '../entities/order.entity';
import {
  OrderTest,
  OrderTestStatus,
  ResultFlag,
} from '../entities/order-test.entity';
import { Patient } from '../entities/patient.entity';
import { Result } from '../entities/result.entity';
import { Sample } from '../entities/sample.entity';
import { Test } from '../entities/test.entity';
import { LabActorContext } from '../types/lab-actor-context';
import { CreateLabOrderDto } from './dto/create-lab-order.dto';
import { EnterResultDto } from './dto/enter-result.dto';
import { UpsertPatientDto } from './dto/upsert-patient.dto';

@Injectable()
export class LabApiService {
  constructor(
    private readonly rlsSessionService: RlsSessionService,
    private readonly auditService: AuditService,
  ) {}

  async searchPatients(
    labId: string,
    params: { q?: string; page?: number; size?: number },
  ): Promise<{ items: Patient[]; total: number; page: number; size: number; totalPages: number }> {
    return this.rlsSessionService.withLabContext(labId, async (manager) => {
      const page = Math.max(1, params.page ?? 1);
      const size = Math.min(100, Math.max(1, params.size ?? 20));
      const skip = (page - 1) * size;

      const qb = manager.getRepository(Patient).createQueryBuilder('p');
      if (params.q?.trim()) {
        const term = `%${params.q.trim()}%`;
        qb.andWhere(
          '(p.fullName ILIKE :term OR p.patientNumber = :exact OR p.phone ILIKE :term OR p.nationalId ILIKE :term OR p.externalId ILIKE :term)',
          { term, exact: params.q.trim() },
        );
      }

      qb.orderBy('p.updatedAt', 'DESC').skip(skip).take(size);
      const [items, total] = await qb.getManyAndCount();
      return {
        items,
        total,
        page,
        size,
        totalPages: Math.ceil(total / size),
      };
    });
  }

  async upsertPatient(
    labId: string,
    dto: UpsertPatientDto,
    actor?: LabActorContext,
  ): Promise<{ patient: Patient; reused: boolean }> {
    return this.rlsSessionService.withLabContext(labId, async (manager) => {
      const patientRepo = manager.getRepository(Patient);
      const existing = await this.findExistingPatient(patientRepo.manager, dto);
      if (existing) {
        return { patient: existing, reused: true };
      }

      const patient = patientRepo.create({
        patientNumber: await this.generatePatientNumber(manager),
        nationalId: dto.nationalId?.trim() || null,
        phone: dto.phone?.trim() || null,
        externalId: dto.externalId?.trim() || null,
        fullName: dto.fullName.trim(),
        dateOfBirth: dto.dateOfBirth || null,
        sex: dto.sex?.trim() || null,
        address: dto.address?.trim() || null,
      });
      const saved = await patientRepo.save(patient);

      const impersonationAudit =
        actor?.isImpersonation && actor.platformUserId
          ? {
              impersonation: {
                active: true,
                platformUserId: actor.platformUserId,
              },
            }
          : {};

      await this.auditService.log({
        actorType: actor?.actorType ?? AuditActorType.LAB_USER,
        actorId: actor?.actorId ?? null,
        userId: actor?.userId ?? null,
        labId,
        action: AuditAction.PATIENT_CREATE,
        entityType: 'patient',
        entityId: saved.id,
        description: `Patient created via /api by lab ${labId}`,
        newValues: impersonationAudit,
      });

      return { patient: saved, reused: false };
    });
  }

  async createOrder(
    labId: string,
    dto: CreateLabOrderDto,
    actor?: LabActorContext,
  ): Promise<Order> {
    return this.rlsSessionService.withLabContext(labId, async (manager) => {
      const lab = await manager.getRepository(Lab).findOne({ where: { id: labId, isActive: true } });
      if (!lab) {
        throw new NotFoundException('Lab not found');
      }

      const patient = await manager.getRepository(Patient).findOne({ where: { id: dto.patientId } });
      if (!patient) {
        throw new NotFoundException('Patient not found');
      }

      const uniqueTestIds = [...new Set(dto.testIds)];
      const tests = await manager.getRepository(Test).find({
        where: uniqueTestIds.map((id) => ({ id, isActive: true })),
      });
      if (tests.length !== uniqueTestIds.length) {
        throw new BadRequestException('One or more tests are invalid');
      }

      const orderNumber = await this.generateOrderNumber(manager, labId);
      const order = manager.getRepository(Order).create({
        patientId: patient.id,
        labId,
        shiftId: dto.shiftId ?? null,
        orderNumber,
        status: OrderStatus.REGISTERED,
        patientType: PatientType.WALK_IN,
        notes: dto.notes?.trim() || null,
        totalAmount: 0,
        discountPercent: 0,
        finalAmount: 0,
      });
      const savedOrder = await manager.getRepository(Order).save(order);

      const sample = manager.getRepository(Sample).create({
        labId,
        orderId: savedOrder.id,
        sampleId: null,
        barcode: orderNumber,
        sequenceNumber: null,
        qrCode: null,
        tubeType: null,
      });
      const savedSample = await manager.getRepository(Sample).save(sample);

      const orderTests = uniqueTestIds.map((testId) =>
        manager.getRepository(OrderTest).create({
          labId,
          sampleId: savedSample.id,
          testId,
          parentOrderTestId: null,
          status: OrderTestStatus.PENDING,
          price: null,
        }),
      );
      await manager.getRepository(OrderTest).save(orderTests);

      const impersonationAudit =
        actor?.isImpersonation && actor.platformUserId
          ? {
              impersonation: {
                active: true,
                platformUserId: actor.platformUserId,
              },
            }
          : {};

      await this.auditService.log({
        actorType: actor?.actorType ?? AuditActorType.LAB_USER,
        actorId: actor?.actorId ?? null,
        userId: actor?.userId ?? null,
        labId,
        action: AuditAction.ORDER_CREATE,
        entityType: 'order',
        entityId: savedOrder.id,
        description: `Order ${savedOrder.orderNumber ?? savedOrder.id} created via /api`,
        newValues: impersonationAudit,
      });

      const fullOrder = await manager.getRepository(Order).findOne({
        where: { id: savedOrder.id, labId },
        relations: ['patient', 'lab', 'shift', 'samples', 'samples.orderTests', 'samples.orderTests.test'],
      });
      if (!fullOrder) {
        throw new NotFoundException('Order not found after create');
      }
      return fullOrder;
    });
  }

  async listOrders(
    labId: string,
    params: { page?: number; size?: number; status?: OrderStatus },
  ): Promise<{ items: Order[]; total: number; page: number; size: number; totalPages: number }> {
    return this.rlsSessionService.withLabContext(labId, async (manager) => {
      const page = Math.max(1, params.page ?? 1);
      const size = Math.min(100, Math.max(1, params.size ?? 20));
      const skip = (page - 1) * size;

      const where = params.status ? { labId, status: params.status } : { labId };
      const [items, total] = await manager.getRepository(Order).findAndCount({
        where,
        relations: ['patient', 'lab', 'shift'],
        order: { registeredAt: 'DESC' },
        skip,
        take: size,
      });

      return {
        items,
        total,
        page,
        size,
        totalPages: Math.ceil(total / size),
      };
    });
  }

  async enterResult(
    labId: string,
    dto: EnterResultDto,
    actor?: LabActorContext,
  ): Promise<OrderTest> {
    return this.rlsSessionService.withLabContext(labId, async (manager) => {
      const orderTestRepo = manager.getRepository(OrderTest);
      const orderTest = await orderTestRepo.findOne({
        where: { id: dto.orderTestId, labId },
      });
      if (!orderTest) {
        throw new NotFoundException('Order test not found');
      }

      const now = new Date();
      const numericValue = Number(dto.value);
      orderTest.resultText = dto.value;
      orderTest.resultValue = Number.isFinite(numericValue) ? numericValue : null;
      orderTest.flag = this.toResultFlag(dto.flags);
      orderTest.resultedAt = now;
      orderTest.resultedBy = actor?.userId ?? null;
      if (orderTest.status !== OrderTestStatus.VERIFIED) {
        orderTest.status = OrderTestStatus.COMPLETED;
      }
      await orderTestRepo.save(orderTest);

      const result = manager.getRepository(Result).create({
        labId,
        orderTestId: orderTest.id,
        analyteCode: dto.analyteCode?.trim() || null,
        value: dto.value,
        unit: dto.unit?.trim() || null,
        flags: dto.flags?.trim() || null,
        enteredAt: now,
        enteredByUserId: actor?.userId ?? null,
      });
      await manager.getRepository(Result).save(result);

      await this.updateOrderStatusAfterResult(manager, labId, orderTest.sampleId);

      const impersonationAudit =
        actor?.isImpersonation && actor.platformUserId
          ? {
              impersonation: {
                active: true,
                platformUserId: actor.platformUserId,
              },
            }
          : {};

      await this.auditService.log({
        actorType: actor?.actorType ?? AuditActorType.LAB_USER,
        actorId: actor?.actorId ?? null,
        userId: actor?.userId ?? null,
        labId,
        action: AuditAction.RESULT_ENTER,
        entityType: 'order_test',
        entityId: orderTest.id,
        description: `Result entered for order test ${orderTest.id}`,
        newValues: impersonationAudit,
      });

      return orderTest;
    });
  }

  async exportOrderResultStub(
    labId: string,
    orderId: string,
    actor?: LabActorContext,
  ): Promise<{ status: string; message: string; orderId: string }> {
    return this.rlsSessionService.withLabContext(labId, async (manager) => {
      const order = await manager.getRepository(Order).findOne({
        where: { id: orderId, labId },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      const impersonationAudit =
        actor?.isImpersonation && actor.platformUserId
          ? {
              impersonation: {
                active: true,
                platformUserId: actor.platformUserId,
              },
            }
          : {};

      await this.auditService.log({
        actorType: actor?.actorType ?? AuditActorType.LAB_USER,
        actorId: actor?.actorId ?? null,
        userId: actor?.userId ?? null,
        labId,
        action: AuditAction.REPORT_EXPORT,
        entityType: 'order',
        entityId: orderId,
        description: `Report export requested for order ${orderId}`,
        newValues: impersonationAudit,
      });

      return {
        status: 'stub',
        message: 'Export/print pipeline should be implemented by report service integration.',
        orderId,
      };
    });
  }

  private async findExistingPatient(
    manager: EntityManager,
    dto: UpsertPatientDto,
  ): Promise<Patient | null> {
    const lookupKeys = this.getPatientLookupKeys();
    const qb = manager.getRepository(Patient).createQueryBuilder('p');
    let hasCondition = false;

    if (lookupKeys.includes('nationalId') && dto.nationalId?.trim()) {
      qb.where('p.nationalId = :nationalId', { nationalId: dto.nationalId.trim() });
      hasCondition = true;
    }
    if (lookupKeys.includes('phone') && dto.phone?.trim()) {
      if (hasCondition) {
        qb.orWhere('p.phone = :phone', { phone: dto.phone.trim() });
      } else {
        qb.where('p.phone = :phone', { phone: dto.phone.trim() });
        hasCondition = true;
      }
    }
    if (lookupKeys.includes('externalId') && dto.externalId?.trim()) {
      if (hasCondition) {
        qb.orWhere('p.externalId = :externalId', { externalId: dto.externalId.trim() });
      } else {
        qb.where('p.externalId = :externalId', { externalId: dto.externalId.trim() });
        hasCondition = true;
      }
    }

    if (!hasCondition) {
      return null;
    }

    return qb.getOne();
  }

  private async generatePatientNumber(manager: EntityManager): Promise<string> {
    const raw = await manager
      .getRepository(Patient)
      .createQueryBuilder('p')
      .select('MAX(p.patientNumber)', 'maxNum')
      .where(`p.patientNumber LIKE 'P-%'`)
      .getRawOne<{ maxNum: string | null }>();
    const maxValue = raw?.maxNum || 'P-000000';
    const current = parseInt(maxValue.replace(/^P-/, ''), 10) || 0;
    return `P-${String(current + 1).padStart(6, '0')}`;
  }

  private async generateOrderNumber(manager: EntityManager, labId: string): Promise<string> {
    const today = new Date();
    const yy = String(today.getFullYear() % 100).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const datePrefix = `${yy}${mm}${dd}`;

    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const raw = await manager
      .getRepository(Order)
      .createQueryBuilder('o')
      .select('COUNT(*)', 'count')
      .where('o.labId = :labId', { labId })
      .andWhere('o.registeredAt BETWEEN :startOfDay AND :endOfDay', { startOfDay, endOfDay })
      .getRawOne<{ count: string }>();

    const sequence = String((parseInt(raw?.count || '0', 10) || 0) + 1).padStart(3, '0');
    return `${datePrefix}${sequence}`;
  }

  private toResultFlag(flag: string | undefined): ResultFlag | null {
    const value = (flag || '').trim().toUpperCase();
    if (value === ResultFlag.NORMAL) return ResultFlag.NORMAL;
    if (value === ResultFlag.HIGH) return ResultFlag.HIGH;
    if (value === ResultFlag.LOW) return ResultFlag.LOW;
    if (value === ResultFlag.CRITICAL_HIGH) return ResultFlag.CRITICAL_HIGH;
    if (value === ResultFlag.CRITICAL_LOW) return ResultFlag.CRITICAL_LOW;
    return null;
  }

  private async updateOrderStatusAfterResult(
    manager: EntityManager,
    labId: string,
    sampleId: string,
  ): Promise<void> {
    const sample = await manager.getRepository(Sample).findOne({
      where: { id: sampleId, labId },
    });
    if (!sample) return;

    const pendingCount = await manager
      .getRepository(OrderTest)
      .createQueryBuilder('ot')
      .where('ot.sampleId IN (SELECT s.id FROM samples s WHERE s.orderId = :orderId)', {
        orderId: sample.orderId,
      })
      .andWhere('ot.labId = :labId', { labId })
      .andWhere('ot.status IN (:...pending)', {
        pending: [OrderTestStatus.PENDING, OrderTestStatus.IN_PROGRESS],
      })
      .getCount();

    await manager.getRepository(Order).update(
      { id: sample.orderId, labId },
      { status: pendingCount === 0 ? OrderStatus.COMPLETED : OrderStatus.IN_PROGRESS },
    );
  }

  private getPatientLookupKeys(): string[] {
    const raw = (process.env.PATIENT_LOOKUP_KEYS || 'nationalId,phone,externalId').trim();
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
}
