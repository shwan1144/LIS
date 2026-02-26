import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { randomBytes, randomUUID } from 'crypto';
import { RefreshToken, RefreshTokenActorType } from '../entities/refresh-token.entity';
import { hashPassword, verifyPassword } from './password.util';

const REFRESH_TOKEN_TTL_DAYS = 30;

export interface RefreshTokenIssueResult {
  token: string;
  tokenId: string;
  familyId: string;
  expiresAt: Date;
}

export interface RefreshTokenRotationResult {
  actorType: RefreshTokenActorType;
  actorId: string;
  context: Record<string, unknown> | null;
  issued: RefreshTokenIssueResult;
}

export interface RefreshTokenValidationResult {
  tokenId: string;
  actorType: RefreshTokenActorType;
  actorId: string;
  familyId: string;
  context: Record<string, unknown> | null;
  expiresAt: Date;
}

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  async issue(params: {
    actorType: RefreshTokenActorType;
    actorId: string;
    familyId?: string;
    context?: Record<string, unknown> | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<RefreshTokenIssueResult> {
    return this.issueWithRepository(this.refreshTokenRepo, params);
  }

  private async issueWithRepository(
    repo: Repository<RefreshToken>,
    params: {
      actorType: RefreshTokenActorType;
      actorId: string;
      familyId?: string;
      context?: Record<string, unknown> | null;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
  ): Promise<RefreshTokenIssueResult> {
    const tokenId = randomUUID();
    const familyId = params.familyId ?? randomUUID();
    const tokenSecret = this.generateTokenSecret();
    const tokenHash = await hashPassword(tokenSecret);
    const expiresAt = this.buildExpiryDate();

    const tokenRecord = repo.create({
      id: tokenId,
      actorType: params.actorType,
      actorId: params.actorId,
      familyId,
      tokenHash,
      expiresAt,
      revokedAt: null,
      replacedByTokenId: null,
      context: params.context ?? null,
      createdIp: params.ipAddress ?? null,
      createdUserAgent: params.userAgent ?? null,
    });
    await repo.save(tokenRecord);

    return {
      token: this.composeRawToken(tokenId, tokenSecret),
      tokenId,
      familyId,
      expiresAt,
    };
  }

  async rotate(
    rawToken: string,
    meta?: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<RefreshTokenRotationResult> {
    const { tokenId, tokenSecret } = this.parseRawToken(rawToken);
    return this.refreshTokenRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(RefreshToken);
      const existing = await repo
        .createQueryBuilder('token')
        .setLock('pessimistic_write')
        .where('token.id = :id', { id: tokenId })
        .getOne();

      if (!existing) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (existing.revokedAt) {
        // Reuse attempt: revoke entire family.
        await this.revokeFamilyWithRepository(repo, existing.familyId);
        throw new UnauthorizedException('Refresh token reuse detected');
      }

      if (existing.expiresAt.getTime() <= Date.now()) {
        existing.revokedAt = new Date();
        await repo.save(existing);
        throw new UnauthorizedException('Refresh token expired');
      }

      const isValid = await verifyPassword(tokenSecret, existing.tokenHash);
      if (!isValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const next = await this.issueWithRepository(repo, {
        actorType: existing.actorType,
        actorId: existing.actorId,
        familyId: existing.familyId,
        context: existing.context ?? null,
        ipAddress: meta?.ipAddress ?? null,
        userAgent: meta?.userAgent ?? null,
      });

      existing.revokedAt = new Date();
      existing.replacedByTokenId = next.tokenId;
      await repo.save(existing);

      return {
        actorType: existing.actorType,
        actorId: existing.actorId,
        context: existing.context ?? null,
        issued: next,
      };
    });
  }

  async revoke(rawToken: string): Promise<void> {
    const { tokenId } = this.parseRawToken(rawToken);
    await this.revokeToken(tokenId);
  }

  async validate(rawToken: string): Promise<RefreshTokenValidationResult> {
    const { tokenId, tokenSecret } = this.parseRawToken(rawToken);
    const existing = await this.refreshTokenRepo.findOne({ where: { id: tokenId } });
    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      throw new UnauthorizedException('Refresh token already revoked');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      await this.revokeToken(existing.id);
      throw new UnauthorizedException('Refresh token expired');
    }

    const isValid = await verifyPassword(tokenSecret, existing.tokenHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      tokenId: existing.id,
      actorType: existing.actorType,
      actorId: existing.actorId,
      familyId: existing.familyId,
      context: existing.context ?? null,
      expiresAt: existing.expiresAt,
    };
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.revokeFamilyWithRepository(this.refreshTokenRepo, familyId);
  }

  private async revokeFamilyWithRepository(
    repo: Repository<RefreshToken>,
    familyId: string,
  ): Promise<void> {
    await repo.update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async revokeToken(tokenId: string): Promise<void> {
    await this.refreshTokenRepo.update(
      { id: tokenId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private composeRawToken(tokenId: string, tokenSecret: string): string {
    return `${tokenId}.${tokenSecret}`;
  }

  private parseRawToken(rawToken: string): { tokenId: string; tokenSecret: string } {
    const [tokenId, tokenSecret] = (rawToken || '').split('.');
    if (!tokenId || !tokenSecret) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return { tokenId, tokenSecret };
  }

  private generateTokenSecret(): string {
    return randomBytes(48).toString('base64url');
  }

  private buildExpiryDate(): Date {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);
    return expiresAt;
  }
}
