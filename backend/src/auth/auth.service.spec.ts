import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { RefreshTokenActorType } from '../entities/refresh-token.entity';
import { PlatformUserRole } from '../entities/platform-user.entity';
import { verifyPassword } from './password.util';

jest.mock('./password.util', () => ({
  verifyPassword: jest.fn(),
}));

function createService() {
  const userRepository = {
    findOne: jest.fn(),
  };
  const labRepository = {
    findOne: jest.fn(),
  };
  const platformUserRepository = {
    findOne: jest.fn(),
  };
  const adminLabPortalTokenRepository = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const jwtService = {
    sign: jest.fn().mockReturnValue('signed-access-token'),
  };
  const auditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };
  const refreshTokenService = {
    issue: jest.fn(),
    rotate: jest.fn(),
    validate: jest.fn(),
    revoke: jest.fn().mockResolvedValue(undefined),
  };
  const authRateLimitService = {
    assertLabLoginAllowed: jest.fn().mockResolvedValue(undefined),
  };

  const service = new AuthService(
    userRepository as never,
    labRepository as never,
    platformUserRepository as never,
    adminLabPortalTokenRepository as never,
    jwtService as never,
    auditService as never,
    refreshTokenService as never,
    authRateLimitService as never,
  );

  return {
    service,
    userRepository,
    labRepository,
    platformUserRepository,
    adminLabPortalTokenRepository,
    jwtService,
    auditService,
    refreshTokenService,
    authRateLimitService,
  };
}

describe('AuthService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns refresh token for lab login', async () => {
    const { service, userRepository, refreshTokenService } = createService();
    const lab = { id: 'lab-1', code: 'LAB01', name: 'Lab 01', enableOnlineResults: true };
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      username: 'tech',
      passwordHash: 'hash',
      role: 'LAB_ADMIN',
      fullName: 'Tech User',
      labId: 'lab-1',
      lab,
      defaultLabId: null,
      defaultLab: null,
      labAssignments: [],
      isActive: true,
    });
    (verifyPassword as jest.Mock).mockResolvedValue(true);
    refreshTokenService.issue.mockResolvedValue({
      token: 'refresh-token-1',
      tokenId: 'rt-1',
      familyId: 'fam-1',
      expiresAt: new Date(),
    });

    const result = await service.login(
      { username: 'tech', password: 'secret' },
      { resolvedLabId: 'lab-1' },
    );

    expect(result.accessToken).toBe('signed-access-token');
    expect(result.refreshToken).toBe('refresh-token-1');
    expect(refreshTokenService.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: RefreshTokenActorType.LAB_USER,
        actorId: 'user-1',
        context: { labId: 'lab-1' },
      }),
    );
  });

  it('returns refresh token for bridge portal login', async () => {
    const {
      service,
      labRepository,
      platformUserRepository,
      adminLabPortalTokenRepository,
      refreshTokenService,
    } = createService();
    const tokenId = '550e8400-e29b-41d4-a716-446655440000';
    const secret = 'abcdefghijklmnopqrstuvwxyz123456';
    const tokenHash = createHash('sha256').update(secret).digest('hex');
    const bridgeToken = `${tokenId}.${secret}`;

    adminLabPortalTokenRepository.findOne.mockResolvedValue({
      id: tokenId,
      platformUserId: 'platform-1',
      labId: 'lab-1',
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    adminLabPortalTokenRepository.createQueryBuilder.mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    });
    platformUserRepository.findOne.mockResolvedValue({
      id: 'platform-1',
      email: 'admin@example.com',
      role: PlatformUserRole.SUPER_ADMIN,
      isActive: true,
    });
    labRepository.findOne.mockResolvedValue({
      id: 'lab-1',
      code: 'LAB01',
      name: 'Lab 01',
      subdomain: 'lab01',
      enableOnlineResults: true,
      isActive: true,
    });
    refreshTokenService.issue.mockResolvedValue({
      token: 'refresh-token-bridge',
      tokenId: 'rt-bridge',
      familyId: 'fam-bridge',
      expiresAt: new Date(),
    });

    const result = await service.loginWithLabPortalBridge(bridgeToken, {
      resolvedLabId: 'lab-1',
    });

    expect(result.refreshToken).toBe('refresh-token-bridge');
    expect(result.user.isImpersonation).toBe(true);
    expect(refreshTokenService.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: RefreshTokenActorType.LAB_IMPERSONATION,
        actorId: 'platform-1',
        context: { labId: 'lab-1', platformUserId: 'platform-1' },
      }),
    );
  });

  it('refreshes impersonated lab session and preserves impersonation user', async () => {
    const { service, platformUserRepository, labRepository, refreshTokenService } = createService();
    refreshTokenService.rotate.mockResolvedValue({
      actorType: RefreshTokenActorType.LAB_IMPERSONATION,
      actorId: 'platform-1',
      context: { labId: 'lab-1', platformUserId: 'platform-1' },
      issued: { token: 'refresh-token-next' },
    });
    platformUserRepository.findOne.mockResolvedValue({
      id: 'platform-1',
      email: 'admin@example.com',
      role: PlatformUserRole.SUPER_ADMIN,
      isActive: true,
    });
    labRepository.findOne.mockResolvedValue({
      id: 'lab-1',
      code: 'LAB01',
      name: 'Lab 01',
      enableOnlineResults: true,
      isActive: true,
    });

    const result = await service.refreshLabToken('refresh-token-old', {
      resolvedLabId: 'lab-1',
    });

    expect(result.refreshToken).toBe('refresh-token-next');
    expect(result.user).toEqual(
      expect.objectContaining({
        username: 'admin@example.com',
        role: 'SUPER_ADMIN',
        isImpersonation: true,
      }),
    );
  });

  it('rejects impersonated lab refresh on lab mismatch', async () => {
    const { service, refreshTokenService } = createService();
    refreshTokenService.rotate.mockResolvedValue({
      actorType: RefreshTokenActorType.LAB_IMPERSONATION,
      actorId: 'platform-1',
      context: { labId: 'lab-1', platformUserId: 'platform-1' },
      issued: { token: 'refresh-token-next' },
    });

    await expect(
      service.refreshLabToken('refresh-token-old', {
        resolvedLabId: 'lab-2',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows logout for impersonated lab refresh token', async () => {
    const { service, refreshTokenService } = createService();
    refreshTokenService.validate.mockResolvedValue({
      tokenId: 'rt-1',
      actorType: RefreshTokenActorType.LAB_IMPERSONATION,
      actorId: 'platform-1',
      familyId: 'fam-1',
      context: { labId: 'lab-1', platformUserId: 'platform-1' },
      expiresAt: new Date(),
    });

    await service.logoutLabToken('refresh-token-old', 'lab-1');

    expect(refreshTokenService.revoke).toHaveBeenCalledWith('refresh-token-old');
  });
});
