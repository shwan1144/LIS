import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnmatchedInstrumentResult, UnmatchedReason } from '../entities/unmatched-instrument-result.entity';
import { OrderTest, OrderTestStatus } from '../entities/order-test.entity';
import { PanelStatusService } from '../panels/panel-status.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../entities/audit-log.entity';
import { LabActorContext } from '../types/lab-actor-context';

export interface UnmatchedResultDto {
  id: string;
  instrumentId: string;
  instrumentCode: string;
  instrumentTestName: string | null;
  sampleIdentifier: string;
  resultValue: number | null;
  resultText: string | null;
  unit: string | null;
  flag: string | null;
  referenceRange: string | null;
  reason: UnmatchedReason;
  details: string | null;
  receivedAt: Date;
  status: string;
  createdAt: Date;
}

export interface ResolveUnmatchedDto {
  action: 'ATTACH' | 'DISCARD';
  orderTestId?: string; // Required if ATTACH
  notes?: string;
}

@Injectable()
export class UnmatchedResultsService {
  constructor(
    @InjectRepository(UnmatchedInstrumentResult)
    private readonly unmatchedRepo: Repository<UnmatchedInstrumentResult>,
    @InjectRepository(OrderTest)
    private readonly orderTestRepo: Repository<OrderTest>,
    private readonly panelStatusService: PanelStatusService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * List unmatched results with filters
   */
  async findAll(
    labId: string,
    params: {
      status?: 'PENDING' | 'RESOLVED' | 'DISCARDED';
      instrumentId?: string;
      reason?: UnmatchedReason;
      page?: number;
      size?: number;
    },
  ): Promise<{ items: UnmatchedInstrumentResult[]; total: number }> {
    const page = params.page ?? 1;
    const size = params.size ?? 50;
    const skip = (page - 1) * size;

    const qb = this.unmatchedRepo
      .createQueryBuilder('u')
      .innerJoin('u.instrument', 'i')
      .where('i.labId = :labId', { labId })
      .orderBy('u.receivedAt', 'DESC');

    if (params.status) {
      qb.andWhere('u.status = :status', { status: params.status });
    }

    if (params.instrumentId) {
      qb.andWhere('u.instrumentId = :instrumentId', { instrumentId: params.instrumentId });
    }

    if (params.reason) {
      qb.andWhere('u.reason = :reason', { reason: params.reason });
    }

    const total = await qb.getCount();
    const items = await qb.skip(skip).take(size).getMany();

    return { items, total };
  }

  /**
   * Get single unmatched result
   */
  async findOne(id: string, labId: string): Promise<UnmatchedInstrumentResult> {
    const result = await this.unmatchedRepo.findOne({
      where: { id },
      relations: ['instrument'],
    });

    if (!result || result.instrument.labId !== labId) {
      throw new NotFoundException('Unmatched result not found');
    }

    return result;
  }

  /**
   * Resolve unmatched result: attach to OrderTest or discard
   */
  async resolve(
    id: string,
    labId: string,
    actor: LabActorContext,
    dto: ResolveUnmatchedDto,
  ): Promise<UnmatchedInstrumentResult> {
    const unmatched = await this.findOne(id, labId);

    if (unmatched.status !== 'PENDING') {
      throw new Error(`Cannot resolve result with status: ${unmatched.status}`);
    }

    if (dto.action === 'ATTACH') {
      if (!dto.orderTestId) {
        throw new Error('orderTestId required for ATTACH action');
      }

      const orderTest = await this.orderTestRepo.findOne({
        where: { id: dto.orderTestId },
        relations: ['test', 'sample', 'sample.order'],
      });

      if (!orderTest) {
        throw new NotFoundException('OrderTest not found');
      }

      if (orderTest.sample.order.labId !== labId) {
        throw new Error('OrderTest does not belong to this lab');
      }

      // Update OrderTest with result from unmatched
      const previousValue = orderTest.resultValue;
      const previousText = orderTest.resultText;

      orderTest.resultValue = unmatched.resultValue;
      orderTest.resultText = unmatched.resultText;
      orderTest.flag = unmatched.flag;
      orderTest.resultedAt = unmatched.receivedAt;
      orderTest.resultedBy = actor.userId;
      orderTest.status = OrderTestStatus.COMPLETED;

      if (unmatched.unit) {
        // Note: OrderTest doesn't have unit field, but Test does
        // You might want to validate unit matches Test.unit
      }

      await this.orderTestRepo.save(orderTest);

      // Recompute parent panel if needed
      if (orderTest.parentOrderTestId) {
        await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
      }

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
        action: AuditAction.RESULT_ENTER,
        entityType: 'order_test',
        entityId: orderTest.id,
        oldValues: previousValue !== null || previousText !== null
          ? { resultValue: previousValue, resultText: previousText }
          : null,
        newValues: {
          resultValue: unmatched.resultValue,
          resultText: unmatched.resultText,
          flag: unmatched.flag,
          source: 'unmatched_inbox',
          unmatchedResultId: unmatched.id,
          ...impersonationAudit,
        },
        description: `Result attached from unmatched inbox`,
      });

      unmatched.status = 'RESOLVED';
      unmatched.resolvedOrderTestId = orderTest.id;
      unmatched.resolvedBy = actor.userId;
      unmatched.resolvedAt = new Date();
      unmatched.resolutionNotes = dto.notes || null;
    } else if (dto.action === 'DISCARD') {
      unmatched.status = 'DISCARDED';
      unmatched.resolvedBy = actor.userId;
      unmatched.resolvedAt = new Date();
      unmatched.resolutionNotes = dto.notes || 'Discarded by user';
    }

    return this.unmatchedRepo.save(unmatched);
  }

  /**
   * Get statistics for unmatched results
   */
  async getStats(
    labId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    pending: number;
    resolved: number;
    discarded: number;
    byReason: Record<UnmatchedReason, number>;
  }> {
    const qb = this.unmatchedRepo
      .createQueryBuilder('u')
      .innerJoin('u.instrument', 'i')
      .where('i.labId = :labId', { labId });

    if (startDate && endDate) {
      qb.andWhere('u.receivedAt BETWEEN :startDate AND :endDate', { startDate, endDate });
    } else if (startDate) {
      qb.andWhere('u.receivedAt >= :startDate', { startDate });
    } else if (endDate) {
      qb.andWhere('u.receivedAt <= :endDate', { endDate });
    }

    const rows = await qb
      .select('u.status', 'status')
      .addSelect('u.reason', 'reason')
      .addSelect('COUNT(*)', 'count')
      .groupBy('u.status')
      .addGroupBy('u.reason')
      .getRawMany<{ status: string; reason: UnmatchedReason; count: string }>();

    const stats = {
      pending: 0,
      resolved: 0,
      discarded: 0,
      byReason: {} as Record<UnmatchedReason, number>,
    };

    for (const reason of Object.values(UnmatchedReason)) {
      stats.byReason[reason] = 0;
    }

    for (const row of rows) {
      const count = parseInt(row.count, 10) || 0;
      if (row.status === 'PENDING') stats.pending += count;
      else if (row.status === 'RESOLVED') stats.resolved += count;
      else if (row.status === 'DISCARDED') stats.discarded += count;

      if (row.reason in stats.byReason) {
        stats.byReason[row.reason] += count;
      }
    }

    return stats;
  }

  /**
   * Count unmatched results per instrument in a date range (for statistics / instrument workload)
   */
  async getCountByInstrumentInPeriod(
    labId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ instrumentId: string; instrumentName: string; count: number }[]> {
    const rows = await this.unmatchedRepo
      .createQueryBuilder('u')
      .innerJoin('u.instrument', 'i')
      .select('i.id', 'instrumentId')
      .addSelect('MAX(COALESCE(i.name, i.code))', 'instrumentName')
      .addSelect('COUNT(*)', 'count')
      .where('i.labId = :labId', { labId })
      .andWhere('u.receivedAt BETWEEN :startDate AND :endDate', { startDate, endDate })
      .groupBy('i.id')
      .getRawMany();

    return rows.map((r) => ({
      instrumentId: r.instrumentId,
      instrumentName: String(r.instrumentName || r.instrumentId),
      count: parseInt(r.count, 10),
    }));
  }
}
