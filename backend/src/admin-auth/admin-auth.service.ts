import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformUser } from '../entities/platform-user.entity';
import { RefreshTokenActorType } from '../entities/refresh-token.entity';
import { AuditAction, AuditActorType } from '../entities/audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { RefreshTokenService } from '../auth/refresh-token.service';
import { verifyPassword } from '../auth/password.util';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminLoginResponseDto, PlatformUserDto } from './dto/admin-login-response.dto';
import type { AdminJwtPayload } from './admin-jwt-payload.interface';

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(PlatformUser)
    private readonly platformUserRepo: Repository<PlatformUser>,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly auditService: AuditService,
    private readonly authRateLimitService: AuthRateLimitService,
  ) {}

  async login(
    dto: AdminLoginDto,
    meta?: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<AdminLoginResponseDto> {
    const email = dto.email.trim().toLowerCase();
    await this.authRateLimitService.assertPlatformLoginAllowed({
      email,
      ipAddress: meta?.ipAddress ?? null,
    });

    const platformUser = await this.platformUserRepo.findOne({
      where: { email, isActive: true },
    });
    if (!platformUser) {
      await this.logFailed(email, 'Platform user not found', meta);
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await verifyPassword(dto.password, platformUser.passwordHash);
    if (!valid) {
      await this.logFailed(email, 'Password mismatch', meta);
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = this.issueAccessToken(platformUser);
    const refresh = await this.refreshTokenService.issue({
      actorType: RefreshTokenActorType.PLATFORM_USER,
      actorId: platformUser.id,
      context: { role: platformUser.role },
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent ?? null,
    });

    await this.auditService.log({
      actorType: AuditActorType.PLATFORM_USER,
      actorId: platformUser.id,
      action: AuditAction.PLATFORM_LOGIN,
      entityType: 'platform_user',
      entityId: platformUser.id,
      description: `Platform user ${platformUser.email} logged in`,
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent ?? null,
    });

    return {
      accessToken,
      refreshToken: refresh.token,
      platformUser: this.toPlatformUserDto(platformUser),
    };
  }

  async refresh(
    refreshToken: string,
    meta?: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<AdminLoginResponseDto> {
    const rotated = await this.refreshTokenService.rotate(refreshToken, meta);
    if (rotated.actorType !== RefreshTokenActorType.PLATFORM_USER) {
      throw new UnauthorizedException('Invalid refresh token scope');
    }

    const platformUser = await this.platformUserRepo.findOne({
      where: { id: rotated.actorId, isActive: true },
    });
    if (!platformUser) {
      throw new UnauthorizedException('Platform user not found');
    }

    return {
      accessToken: this.issueAccessToken(platformUser),
      refreshToken: rotated.issued.token,
      platformUser: this.toPlatformUserDto(platformUser),
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokenService.revoke(refreshToken);
  }

  async issueAccessTokenByPlatformUserId(
    platformUserId: string,
    options?: { impersonatedLabId?: string | null },
  ): Promise<{ accessToken: string; platformUser: PlatformUserDto }> {
    const platformUser = await this.platformUserRepo.findOne({
      where: { id: platformUserId, isActive: true },
    });
    if (!platformUser) {
      throw new UnauthorizedException('Platform user not found');
    }

    return {
      accessToken: this.issueAccessToken(platformUser, options),
      platformUser: this.toPlatformUserDto(platformUser),
    };
  }

  issueAccessToken(
    platformUser: PlatformUser,
    options?: { impersonatedLabId?: string | null },
  ): string {
    const payload = this.buildAccessPayload(platformUser, options);
    return this.jwtService.sign(payload);
  }

  private toPlatformUserDto(platformUser: PlatformUser): PlatformUserDto {
    return {
      id: platformUser.id,
      email: platformUser.email,
      role: platformUser.role,
    };
  }

  private buildAccessPayload(
    platformUser: PlatformUser,
    options?: { impersonatedLabId?: string | null },
  ): AdminJwtPayload {
    const payload: AdminJwtPayload = {
      sub: platformUser.id,
      email: platformUser.email,
      role: platformUser.role,
      tokenType: 'platform_access',
    };

    const impersonatedLabId = options?.impersonatedLabId?.trim();
    if (impersonatedLabId) {
      payload.impersonatedLabId = impersonatedLabId;
      payload.impersonationStartedAt = new Date().toISOString();
    }

    return payload;
  }

  private async logFailed(
    email: string,
    reason: string,
    meta?: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<void> {
    await this.auditService.log({
      actorType: AuditActorType.PLATFORM_USER,
      actorId: null,
      action: AuditAction.PLATFORM_LOGIN_FAILED,
      entityType: 'platform_user',
      entityId: null,
      description: `Failed platform login for ${email}: ${reason}`,
      newValues: {
        email,
        reason,
      },
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent ?? null,
    });
  }
}
