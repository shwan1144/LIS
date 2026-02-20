import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { User } from '../entities/user.entity';
import { Lab } from '../entities/lab.entity';
import { PlatformUser, PlatformUserRole } from '../entities/platform-user.entity';
import { AdminLabPortalToken } from '../entities/admin-lab-portal-token.entity';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto, LabDto, UserDto } from './dto/login-response.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditActorType } from '../entities/audit-log.entity';
import { RefreshTokenActorType } from '../entities/refresh-token.entity';
import { RefreshTokenService } from './refresh-token.service';
import { verifyPassword } from './password.util';
import { AuthRateLimitService } from './auth-rate-limit.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Lab)
    private readonly labRepository: Repository<Lab>,
    @InjectRepository(PlatformUser)
    private readonly platformUserRepository: Repository<PlatformUser>,
    @InjectRepository(AdminLabPortalToken)
    private readonly adminLabPortalTokenRepository: Repository<AdminLabPortalToken>,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly authRateLimitService: AuthRateLimitService,
  ) {}

  async login(
    dto: LoginDto,
    params?: {
      resolvedLabId?: string | null;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
  ): Promise<LoginResponseDto> {
    const resolvedLabId = params?.resolvedLabId ?? null;
    const username = dto.username.trim();
    await this.authRateLimitService.assertLabLoginAllowed({
      username,
      labId: resolvedLabId,
      ipAddress: params?.ipAddress ?? null,
    });

    const user = await this.findUserForLogin(username, resolvedLabId);

    if (!user) {
      await this.logFailedLogin(resolvedLabId, username, 'User not found', {
        ipAddress: params?.ipAddress ?? null,
        userAgent: params?.userAgent ?? null,
      });
      throw new UnauthorizedException('Invalid username or password');
    }

    const isPasswordValid = await verifyPassword(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      await this.logFailedLogin(resolvedLabId, username, 'Password mismatch', {
        ipAddress: params?.ipAddress ?? null,
        userAgent: params?.userAgent ?? null,
      });
      throw new UnauthorizedException('Invalid username or password');
    }

    const lab = this.resolveLabForUser(user, resolvedLabId);
    if (!lab) {
      throw new UnauthorizedException('User has no lab assigned');
    }

    const payload = {
      sub: user.id,
      username: user.username,
      labId: lab.id,
      role: user.role,
      tokenType: 'lab_access' as const,
    };
    const accessToken = this.jwtService.sign(payload);
    const refresh = await this.refreshTokenService.issue({
      actorType: RefreshTokenActorType.LAB_USER,
      actorId: user.id,
      context: { labId: lab.id },
      ipAddress: params?.ipAddress ?? null,
      userAgent: params?.userAgent ?? null,
    });

    // Audit log for successful login
    await this.auditService.log({
      actorType: AuditActorType.LAB_USER,
      actorId: user.id,
      labId: lab.id,
      userId: user.id,
      action: AuditAction.LOGIN,
      entityType: 'user',
      entityId: user.id,
      description: `User ${user.username} logged in`,
      ipAddress: params?.ipAddress ?? null,
      userAgent: params?.userAgent ?? null,
    });

    return {
      accessToken,
      refreshToken: refresh.token,
      user: this.toUserDto(user),
      lab: this.toLabDto(lab),
    };
  }

  async refreshLabToken(
    refreshToken: string,
    meta?: {
      resolvedLabId?: string | null;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
  ): Promise<LoginResponseDto> {
    const rotated = await this.refreshTokenService.rotate(refreshToken, meta);
    if (rotated.actorType !== RefreshTokenActorType.LAB_USER) {
      throw new UnauthorizedException('Invalid refresh token scope');
    }

    const user = await this.userRepository.findOne({
      where: { id: rotated.actorId, isActive: true },
      relations: ['defaultLab', 'labAssignments', 'labAssignments.lab', 'lab'],
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const contextLabId = (rotated.context?.labId as string | undefined) ?? null;
    if (meta?.resolvedLabId && contextLabId !== meta.resolvedLabId) {
      throw new UnauthorizedException('Refresh token lab context mismatch');
    }
    const lab = this.resolveLabForUser(user, contextLabId);
    if (!lab) {
      throw new UnauthorizedException('Lab not found for refresh token');
    }

    const payload = {
      sub: user.id,
      username: user.username,
      labId: lab.id,
      role: user.role,
      tokenType: 'lab_access' as const,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: rotated.issued.token,
      user: this.toUserDto(user),
      lab: this.toLabDto(lab),
    };
  }

  async logoutLabToken(refreshToken: string, resolvedLabId: string | null = null): Promise<void> {
    const token = await this.refreshTokenService.validate(refreshToken);
    if (token.actorType !== RefreshTokenActorType.LAB_USER) {
      throw new UnauthorizedException('Invalid refresh token scope');
    }
    const contextLabId = (token.context?.labId as string | undefined) ?? null;
    if (resolvedLabId && contextLabId !== resolvedLabId) {
      throw new UnauthorizedException('Refresh token lab context mismatch');
    }
    await this.refreshTokenService.revoke(refreshToken);
  }

  async issueLabPortalBridgeToken(params: {
    platformUserId: string;
    labId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<{
    bridgeToken: string;
    expiresAt: string;
    lab: {
      id: string;
      code: string;
      name: string;
      subdomain: string | null;
    };
  }> {
    const platformUser = await this.platformUserRepository.findOne({
      where: { id: params.platformUserId, isActive: true },
    });
    if (!platformUser) {
      throw new UnauthorizedException('Platform user not found');
    }
    if (platformUser.role !== PlatformUserRole.SUPER_ADMIN) {
      throw new UnauthorizedException('Only super admins can open lab panel');
    }

    const lab = await this.labRepository.findOne({
      where: { id: params.labId, isActive: true },
    });
    if (!lab) {
      throw new UnauthorizedException('Lab not found or disabled');
    }

    const secret = randomBytes(32).toString('base64url');
    const tokenRecord = this.adminLabPortalTokenRepository.create({
      id: randomUUID(),
      platformUserId: platformUser.id,
      labId: lab.id,
      tokenHash: this.hashLabPortalSecret(secret),
      expiresAt: new Date(Date.now() + this.getLabPortalBridgeTtlSeconds() * 1000),
      usedAt: null,
      createdIp: this.normalizeIpAddress(params.ipAddress),
      createdUserAgent: this.normalizeUserAgent(params.userAgent),
      usedIp: null,
      usedUserAgent: null,
    });
    await this.adminLabPortalTokenRepository.save(tokenRecord);

    await this.auditService.log({
      actorType: AuditActorType.PLATFORM_USER,
      actorId: platformUser.id,
      labId: lab.id,
      action: AuditAction.PLATFORM_SENSITIVE_READ,
      entityType: 'admin_lab_portal_token',
      entityId: tokenRecord.id,
      description: `Issued one-time lab portal token for ${lab.name} (${lab.code})`,
      newValues: {
        expiresAt: tokenRecord.expiresAt.toISOString(),
      },
      ipAddress: this.normalizeIpAddress(params.ipAddress),
      userAgent: this.normalizeUserAgent(params.userAgent),
    });

    return {
      bridgeToken: `${tokenRecord.id}.${secret}`,
      expiresAt: tokenRecord.expiresAt.toISOString(),
      lab: {
        id: lab.id,
        code: lab.code,
        name: lab.name,
        subdomain: lab.subdomain ?? null,
      },
    };
  }

  async loginWithLabPortalBridge(
    rawToken: string,
    params?: {
      resolvedLabId?: string | null;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
  ): Promise<LoginResponseDto> {
    const parsedToken = this.parseLabPortalBridgeToken(rawToken);
    if (!parsedToken) {
      throw new UnauthorizedException('Invalid portal token');
    }

    const resolvedLabId = params?.resolvedLabId?.trim() || null;
    if (!resolvedLabId) {
      throw new UnauthorizedException('Lab context required');
    }

    const tokenRecord = await this.adminLabPortalTokenRepository.findOne({
      where: { id: parsedToken.tokenId },
    });
    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid portal token');
    }

    const hashedSecret = this.hashLabPortalSecret(parsedToken.secret);
    if (!this.constantTimeHashMatch(tokenRecord.tokenHash, hashedSecret)) {
      throw new UnauthorizedException('Invalid portal token');
    }
    if (tokenRecord.usedAt) {
      throw new UnauthorizedException('Portal token already used');
    }
    if (tokenRecord.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Portal token expired');
    }
    if (tokenRecord.labId !== resolvedLabId) {
      throw new UnauthorizedException('Portal token lab mismatch');
    }

    const platformUser = await this.platformUserRepository.findOne({
      where: { id: tokenRecord.platformUserId, isActive: true },
    });
    if (!platformUser || platformUser.role !== PlatformUserRole.SUPER_ADMIN) {
      throw new UnauthorizedException('Platform user not allowed');
    }

    const lab = await this.labRepository.findOne({
      where: { id: tokenRecord.labId, isActive: true },
    });
    if (!lab) {
      throw new UnauthorizedException('Lab not found or disabled');
    }

    const usedAt = new Date();
    const updateResult = await this.adminLabPortalTokenRepository
      .createQueryBuilder()
      .update(AdminLabPortalToken)
      .set({
        usedAt,
        usedIp: this.normalizeIpAddress(params?.ipAddress),
        usedUserAgent: this.normalizeUserAgent(params?.userAgent),
      })
      .where('id = :id', { id: tokenRecord.id })
      .andWhere('"usedAt" IS NULL')
      .andWhere('"expiresAt" > :now', { now: usedAt.toISOString() })
      .execute();

    if ((updateResult.affected ?? 0) !== 1) {
      throw new UnauthorizedException('Portal token already used or expired');
    }

    const payload = {
      sub: platformUser.id,
      username: platformUser.email,
      labId: lab.id,
      role: platformUser.role,
      tokenType: 'lab_impersonation_access' as const,
      platformUserId: platformUser.id,
    };
    const accessToken = this.jwtService.sign(payload);

    await this.auditService.log({
      actorType: AuditActorType.PLATFORM_USER,
      actorId: platformUser.id,
      labId: lab.id,
      action: AuditAction.PLATFORM_SENSITIVE_READ,
      entityType: 'admin_lab_portal_token',
      entityId: tokenRecord.id,
      description: `Opened lab panel via one-time token for ${lab.name} (${lab.code})`,
      ipAddress: this.normalizeIpAddress(params?.ipAddress),
      userAgent: this.normalizeUserAgent(params?.userAgent),
    });

    return {
      accessToken,
      user: {
        id: platformUser.id,
        username: platformUser.email,
        fullName: null,
        role: 'SUPER_ADMIN',
        isImpersonation: true,
      },
      lab: this.toLabDto(lab),
    };
  }

  private async findUserForLogin(username: string, resolvedLabId: string | null): Promise<User | null> {
    if (resolvedLabId) {
      return this.userRepository.findOne({
        where: { username, labId: resolvedLabId, isActive: true },
        relations: ['defaultLab', 'labAssignments', 'labAssignments.lab', 'lab'],
      });
    }

    return this.userRepository.findOne({
      where: { username, isActive: true },
      relations: ['defaultLab', 'labAssignments', 'labAssignments.lab', 'lab'],
    });
  }

  private resolveLabForUser(user: User, resolvedLabId: string | null): Lab | null {
    if (resolvedLabId) {
      if (user.labId === resolvedLabId && user.lab) return user.lab;
      if (user.defaultLabId === resolvedLabId && user.defaultLab) return user.defaultLab;
      const matched = user.labAssignments?.find((a) => a.labId === resolvedLabId);
      if (matched?.lab) return matched.lab;
      return null;
    }
    if (user.labId && user.lab) {
      return user.lab;
    }
    if (user.defaultLabId && user.defaultLab) {
      return user.defaultLab;
    }
    const firstAssignment = user.labAssignments?.[0];
    return firstAssignment?.lab ?? null;
  }

  private getLabPortalBridgeTtlSeconds(): number {
    const parsed = Number(process.env.LAB_PORTAL_BRIDGE_TTL_SECONDS || 90);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 90;
    }
    return Math.min(300, Math.floor(parsed));
  }

  private parseLabPortalBridgeToken(rawToken: string): { tokenId: string; secret: string } | null {
    const trimmed = rawToken.trim();
    if (!trimmed) return null;

    const parts = trimmed.split('.');
    if (parts.length !== 2) return null;

    const tokenId = parts[0]?.trim() ?? '';
    const secret = parts[1]?.trim() ?? '';
    if (!tokenId || !secret) return null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tokenId)) {
      return null;
    }
    if (secret.length < 20 || secret.length > 255) {
      return null;
    }

    return { tokenId, secret };
  }

  private hashLabPortalSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private constantTimeHashMatch(expectedHex: string, candidateHex: string): boolean {
    try {
      const expected = Buffer.from(expectedHex, 'hex');
      const candidate = Buffer.from(candidateHex, 'hex');
      if (
        expected.length === 0 ||
        candidate.length === 0 ||
        expected.length !== candidate.length
      ) {
        return false;
      }
      return timingSafeEqual(expected, candidate);
    } catch {
      return false;
    }
  }

  private normalizeIpAddress(value?: string | null): string | null {
    const ip = value?.trim();
    if (!ip) return null;
    return ip.slice(0, 45);
  }

  private normalizeUserAgent(value?: string | null): string | null {
    const userAgent = value?.trim();
    if (!userAgent) return null;
    return userAgent.slice(0, 500);
  }

  private async logFailedLogin(
    labId: string | null,
    username: string,
    reason: string,
    meta?: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<void> {
    await this.auditService.log({
      actorType: AuditActorType.LAB_USER,
      actorId: null,
      labId,
      action: AuditAction.LOGIN_FAILED,
      entityType: 'user',
      entityId: null,
      description: `Failed login for ${username}: ${reason}`,
      newValues: {
        username,
        reason,
      },
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent ?? null,
    });
  }

  private toUserDto(user: User): UserDto {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      isImpersonation: false,
    };
  }

  private toLabDto(lab: Lab): LabDto {
    return {
      id: lab.id,
      code: lab.code,
      name: lab.name,
      labelSequenceBy: lab.labelSequenceBy ?? 'tube_type',
      sequenceResetBy: lab.sequenceResetBy ?? 'day',
      enableOnlineResults: lab.enableOnlineResults !== false,
    };
  }
}
