import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction, AuditActorType } from '../entities/audit-log.entity';
import { User } from '../entities/user.entity';
import { Lab } from '../entities/lab.entity';
import { getUtcRangeForLabDate, normalizeLabTimeZone } from '../database/lab-timezone.util';

export interface AuditLogParams {
  labId?: string;
  userId?: string;
  action?: AuditAction | AuditAction[];
  entityType?: string;
  entityId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  size?: number;
}

export interface CreateAuditLogDto {
  actorType?: AuditActorType | null;
  actorId?: string | null;
  labId?: string | null;
  userId?: string | null;
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  description?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Lab)
    private readonly labRepo: Repository<Lab>,
  ) {}

  async log(dto: CreateAuditLogDto): Promise<AuditLog> {
    let normalizedUserId = dto.userId ?? null;
    if (normalizedUserId) {
      const userExists = await this.userRepo.exist({ where: { id: normalizedUserId } });
      if (!userExists) {
        normalizedUserId = null;
      }
    }

    const auditLog = this.auditLogRepo.create({
      actorType: dto.actorType ?? (normalizedUserId ? AuditActorType.LAB_USER : null),
      actorId: dto.actorId ?? normalizedUserId ?? null,
      labId: dto.labId ?? null,
      userId: normalizedUserId,
      action: dto.action,
      entityType: dto.entityType ?? null,
      entityId: dto.entityId ?? null,
      oldValues: dto.oldValues ?? null,
      newValues: dto.newValues ?? null,
      description: dto.description ?? null,
      ipAddress: dto.ipAddress ?? null,
      userAgent: dto.userAgent ?? null,
    });

    try {
      return await this.auditLogRepo.save(auditLog);
    } catch (error) {
      // If FK checks race with pending tx visibility (e.g., newly created lab),
      // keep business operation successful and store audit entry without lab/user FK.
      if (this.isForeignKeyViolation(error)) {
        const fallback = this.auditLogRepo.create({
          actorType: dto.actorType ?? (normalizedUserId ? AuditActorType.LAB_USER : null),
          actorId: dto.actorId ?? normalizedUserId ?? null,
          labId: null,
          userId: null,
          action: dto.action,
          entityType: dto.entityType ?? null,
          entityId: dto.entityId ?? null,
          oldValues: dto.oldValues ?? null,
          newValues: dto.newValues ?? null,
          description: dto.description ?? null,
          ipAddress: dto.ipAddress ?? null,
          userAgent: dto.userAgent ?? null,
        });
        return this.auditLogRepo.save(fallback);
      }
      throw error;
    }
  }

  private isForeignKeyViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const err = error as { code?: string };
    return err.code === '23503';
  }

  async findAll(
    labId: string,
    params: AuditLogParams,
  ): Promise<{ items: AuditLog[]; total: number }> {
    const page = params.page ?? 1;
    const size = params.size ?? 50;
    const skip = (page - 1) * size;

    const qb = this.auditLogRepo
      .createQueryBuilder('audit')
      .leftJoinAndSelect('audit.user', 'user')
      .where('audit."labId" = :labId', { labId });
    const labTimeZone = await this.getLabTimeZone(labId);

    if (params.userId) {
      qb.andWhere('audit."userId" = :userId', { userId: params.userId });
    }

    if (params.action) {
      if (Array.isArray(params.action)) {
        qb.andWhere('audit."action" IN (:...actions)', { actions: params.action });
      } else {
        qb.andWhere('audit."action" = :action', { action: params.action });
      }
    }

    if (params.entityType) {
      qb.andWhere('audit."entityType" = :entityType', { entityType: params.entityType });
    }

    if (params.entityId) {
      qb.andWhere('audit."entityId" = :entityId', { entityId: params.entityId });
    }

    if (params.startDate && params.endDate) {
      const { startDate } = this.getDateRangeOrThrow(params.startDate, labTimeZone, 'startDate');
      const { endDate } = this.getDateRangeOrThrow(params.endDate, labTimeZone, 'endDate');
      if (startDate.getTime() > endDate.getTime()) {
        throw new BadRequestException('startDate cannot be after endDate');
      }
      qb.andWhere('audit."createdAt" BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (params.startDate) {
      const { startDate } = this.getDateRangeOrThrow(params.startDate, labTimeZone, 'startDate');
      qb.andWhere('audit."createdAt" >= :startDate', {
        startDate,
      });
    } else if (params.endDate) {
      const { endDate } = this.getDateRangeOrThrow(params.endDate, labTimeZone, 'endDate');
      qb.andWhere('audit."createdAt" <= :endDate', {
        endDate,
      });
    }

    if (params.search) {
      qb.andWhere(
        '(audit."description" ILIKE :search OR user.username ILIKE :search OR user.fullName ILIKE :search)',
        { search: `%${params.search}%` },
      );
    }

    const total = await qb.clone().getCount();
    const items = await qb
      .clone()
      .orderBy('audit.createdAt', 'DESC')
      .skip(skip)
      .take(size)
      .getMany();

    return { items, total };
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

  async getActions(): Promise<string[]> {
    return Object.values(AuditAction);
  }

  async getEntityTypes(labId: string): Promise<string[]> {
    const result = await this.auditLogRepo
      .createQueryBuilder('audit')
      .select('DISTINCT audit."entityType"', 'entityType')
      .where('audit."labId" = :labId', { labId })
      .andWhere('audit."entityType" IS NOT NULL')
      .getRawMany();
    return result.map((r) => r.entityType).filter(Boolean);
  }
}
