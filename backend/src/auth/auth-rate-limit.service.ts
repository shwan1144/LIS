import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditAction, AuditActorType, AuditLog } from '../entities/audit-log.entity';

@Injectable()
export class AuthRateLimitService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  private readonly rateWindowSeconds = this.readPositiveInt('AUTH_LOGIN_RATE_WINDOW_SECONDS', 300);
  private readonly rateMaxAttemptsPerIp = this.readPositiveInt(
    'AUTH_LOGIN_RATE_MAX_ATTEMPTS_PER_IP',
    40,
  );
  private readonly failedWindowSeconds = this.readPositiveInt('AUTH_LOGIN_FAILED_WINDOW_SECONDS', 900);
  private readonly failedMaxPerIp = this.readPositiveInt('AUTH_LOGIN_FAILED_MAX_PER_IP', 10);
  private readonly failedMaxPerIdentifier = this.readPositiveInt(
    'AUTH_LOGIN_FAILED_MAX_PER_IDENTIFIER',
    5,
  );

  async assertLabLoginAllowed(params: {
    username: string;
    labId?: string | null;
    ipAddress?: string | null;
  }): Promise<void> {
    const username = params.username?.trim();
    const ipAddress = params.ipAddress?.trim();
    const labScope = params.labId?.trim() || null;
    const rateCutoff = this.cutoff(this.rateWindowSeconds);
    const failedCutoff = this.cutoff(this.failedWindowSeconds);

    const [attemptsFromIp, failedFromIp, failedForAccount] = await Promise.all([
      ipAddress
        ? this.countByIp(
            AuditActorType.LAB_USER,
            [AuditAction.LOGIN, AuditAction.LOGIN_FAILED],
            rateCutoff,
            ipAddress,
          )
        : Promise.resolve(0),
      ipAddress
        ? this.countByIp(AuditActorType.LAB_USER, [AuditAction.LOGIN_FAILED], failedCutoff, ipAddress)
        : Promise.resolve(0),
      username
        ? this.countFailedLabByIdentifier(username, labScope, failedCutoff)
        : Promise.resolve(0),
    ]);

    if (attemptsFromIp >= this.rateMaxAttemptsPerIp) {
      throw new HttpException(
        this.tooManyRequestsMessage('Too many login attempts from this IP', this.rateWindowSeconds),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (failedFromIp >= this.failedMaxPerIp) {
      throw new HttpException(
        this.tooManyRequestsMessage(
          'Too many failed login attempts from this IP',
          this.failedWindowSeconds,
        ),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (failedForAccount >= this.failedMaxPerIdentifier) {
      throw new HttpException(
        this.tooManyRequestsMessage(
          'Too many failed login attempts for this account',
          this.failedWindowSeconds,
        ),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async assertPlatformLoginAllowed(params: {
    email: string;
    ipAddress?: string | null;
  }): Promise<void> {
    const email = params.email?.trim().toLowerCase();
    const ipAddress = params.ipAddress?.trim();
    const rateCutoff = this.cutoff(this.rateWindowSeconds);
    const failedCutoff = this.cutoff(this.failedWindowSeconds);

    const [attemptsFromIp, failedFromIp, failedForAccount] = await Promise.all([
      ipAddress
        ? this.countByIp(
            AuditActorType.PLATFORM_USER,
            [AuditAction.PLATFORM_LOGIN, AuditAction.PLATFORM_LOGIN_FAILED],
            rateCutoff,
            ipAddress,
          )
        : Promise.resolve(0),
      ipAddress
        ? this.countByIp(
            AuditActorType.PLATFORM_USER,
            [AuditAction.PLATFORM_LOGIN_FAILED],
            failedCutoff,
            ipAddress,
          )
        : Promise.resolve(0),
      email ? this.countFailedPlatformByIdentifier(email, failedCutoff) : Promise.resolve(0),
    ]);

    if (attemptsFromIp >= this.rateMaxAttemptsPerIp) {
      throw new HttpException(
        this.tooManyRequestsMessage('Too many login attempts from this IP', this.rateWindowSeconds),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (failedFromIp >= this.failedMaxPerIp) {
      throw new HttpException(
        this.tooManyRequestsMessage(
          'Too many failed login attempts from this IP',
          this.failedWindowSeconds,
        ),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (failedForAccount >= this.failedMaxPerIdentifier) {
      throw new HttpException(
        this.tooManyRequestsMessage(
          'Too many failed login attempts for this account',
          this.failedWindowSeconds,
        ),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async countByIp(
    actorType: AuditActorType,
    actions: AuditAction[],
    cutoff: Date,
    ipAddress: string,
  ): Promise<number> {
    const row = await this.auditLogRepo
      .createQueryBuilder('audit')
      .select('COUNT(*)', 'count')
      .where('audit."actorType" = :actorType', { actorType })
      .andWhere('audit."action" IN (:...actions)', { actions })
      .andWhere('audit."createdAt" >= :cutoff', { cutoff })
      .andWhere('audit."ipAddress" = :ipAddress', { ipAddress })
      .getRawOne<{ count: string }>();

    return Number(row?.count ?? 0);
  }

  private async countFailedLabByIdentifier(
    username: string,
    labId: string | null,
    cutoff: Date,
  ): Promise<number> {
    const row = await this.auditLogRepo
      .createQueryBuilder('audit')
      .select('COUNT(*)', 'count')
      .where('audit."actorType" = :actorType', { actorType: AuditActorType.LAB_USER })
      .andWhere('audit."action" = :action', { action: AuditAction.LOGIN_FAILED })
      .andWhere('audit."createdAt" >= :cutoff', { cutoff })
      .andWhere(`COALESCE(audit."labId"::text, '') = :labScope`, { labScope: labId ?? '' })
      .andWhere(`audit."newValues"->>'username' = :username`, { username })
      .getRawOne<{ count: string }>();

    return Number(row?.count ?? 0);
  }

  private async countFailedPlatformByIdentifier(email: string, cutoff: Date): Promise<number> {
    const row = await this.auditLogRepo
      .createQueryBuilder('audit')
      .select('COUNT(*)', 'count')
      .where('audit."actorType" = :actorType', { actorType: AuditActorType.PLATFORM_USER })
      .andWhere('audit."action" = :action', { action: AuditAction.PLATFORM_LOGIN_FAILED })
      .andWhere('audit."createdAt" >= :cutoff', { cutoff })
      .andWhere(`audit."newValues"->>'email' = :email`, { email })
      .getRawOne<{ count: string }>();

    return Number(row?.count ?? 0);
  }

  private cutoff(windowSeconds: number): Date {
    return new Date(Date.now() - windowSeconds * 1000);
  }

  private tooManyRequestsMessage(prefix: string, windowSeconds: number): string {
    const minutes = Math.max(1, Math.ceil(windowSeconds / 60));
    return `${prefix}. Try again in about ${minutes} minute${minutes > 1 ? 's' : ''}.`;
  }

  private readPositiveInt(key: string, fallback: number): number {
    const value = Number(process.env[key]);
    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return Math.floor(value);
  }
}
