import { UnauthorizedException } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { RefreshTokenActorType } from '../entities/refresh-token.entity';
import { PlatformUserRole } from '../entities/platform-user.entity';
import { verifyPassword } from '../auth/password.util';

jest.mock('../auth/password.util', () => ({
  verifyPassword: jest.fn(),
}));

function createService() {
  const platformUserRepo = {
    findOne: jest.fn(),
  };
  const jwtService = {
    sign: jest.fn().mockReturnValue('platform-access-token'),
  };
  const refreshTokenService = {
    issue: jest.fn(),
    rotate: jest.fn(),
    validate: jest.fn(),
    revoke: jest.fn().mockResolvedValue(undefined),
  };
  const auditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };
  const authRateLimitService = {
    assertPlatformLoginAllowed: jest.fn().mockResolvedValue(undefined),
  };

  const service = new AdminAuthService(
    platformUserRepo as never,
    jwtService as never,
    refreshTokenService as never,
    auditService as never,
    authRateLimitService as never,
  );

  return {
    service,
    platformUserRepo,
    jwtService,
    refreshTokenService,
    auditService,
    authRateLimitService,
  };
}

describe('AdminAuthService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('stores platform refresh context with impersonatedLabId null on login', async () => {
    const { service, platformUserRepo, refreshTokenService } = createService();
    platformUserRepo.findOne.mockResolvedValue({
      id: 'platform-1',
      email: 'admin@example.com',
      role: PlatformUserRole.SUPER_ADMIN,
      passwordHash: 'hash',
      isActive: true,
    });
    (verifyPassword as jest.Mock).mockResolvedValue(true);
    refreshTokenService.issue.mockResolvedValue({
      token: 'refresh-token-platform',
      tokenId: 'rt-1',
      familyId: 'fam-1',
      expiresAt: new Date(),
    });

    const result = await service.login({
      email: 'admin@example.com',
      password: 'secret',
    });

    expect(result.refreshToken).toBe('refresh-token-platform');
    expect(refreshTokenService.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: RefreshTokenActorType.PLATFORM_USER,
        context: {
          role: PlatformUserRole.SUPER_ADMIN,
          impersonatedLabId: null,
        },
      }),
    );
  });

  it('preserves impersonatedLabId when refreshing platform session', async () => {
    const { service, platformUserRepo, refreshTokenService } = createService();
    const platformUser = {
      id: 'platform-1',
      email: 'admin@example.com',
      role: PlatformUserRole.SUPER_ADMIN,
      isActive: true,
    };
    platformUserRepo.findOne.mockResolvedValue(platformUser);
    refreshTokenService.rotate.mockResolvedValue({
      actorType: RefreshTokenActorType.PLATFORM_USER,
      actorId: 'platform-1',
      context: {
        role: PlatformUserRole.SUPER_ADMIN,
        impersonatedLabId: 'lab-1',
      },
      issued: { token: 'refresh-token-next' },
    });
    const issueAccessTokenSpy = jest
      .spyOn(service, 'issueAccessToken')
      .mockReturnValue('platform-access-refresh');

    const result = await service.refresh('refresh-token-old');

    expect(issueAccessTokenSpy).toHaveBeenCalledWith(platformUser, {
      impersonatedLabId: 'lab-1',
    });
    expect(result.refreshToken).toBe('refresh-token-next');
  });

  it('reissues session with updated impersonation context', async () => {
    const { service, platformUserRepo, refreshTokenService } = createService();
    const platformUser = {
      id: 'platform-1',
      email: 'admin@example.com',
      role: PlatformUserRole.SUPER_ADMIN,
      isActive: true,
    };
    refreshTokenService.validate.mockResolvedValue({
      tokenId: 'rt-1',
      actorType: RefreshTokenActorType.PLATFORM_USER,
      actorId: 'platform-1',
      familyId: 'fam-1',
      context: {
        role: PlatformUserRole.SUPER_ADMIN,
        impersonatedLabId: null,
      },
      expiresAt: new Date(),
    });
    refreshTokenService.rotate.mockResolvedValue({
      actorType: RefreshTokenActorType.PLATFORM_USER,
      actorId: 'platform-1',
      context: {
        role: PlatformUserRole.SUPER_ADMIN,
        impersonatedLabId: 'lab-9',
      },
      issued: { token: 'refresh-token-rotated' },
    });
    platformUserRepo.findOne.mockResolvedValue(platformUser);
    const issueAccessTokenSpy = jest
      .spyOn(service, 'issueAccessToken')
      .mockReturnValue('platform-access-impersonating');

    const result = await service.reissueSession('refresh-token-current', {
      platformUserId: 'platform-1',
      impersonatedLabId: 'lab-9',
    });

    expect(refreshTokenService.rotate).toHaveBeenCalledWith(
      'refresh-token-current',
      undefined,
      {
        nextContext: {
          role: PlatformUserRole.SUPER_ADMIN,
          impersonatedLabId: 'lab-9',
        },
      },
    );
    expect(issueAccessTokenSpy).toHaveBeenCalledWith(platformUser, {
      impersonatedLabId: 'lab-9',
    });
    expect(result.refreshToken).toBe('refresh-token-rotated');
  });

  it('rejects reissuing a session for another platform user', async () => {
    const { service, refreshTokenService } = createService();
    refreshTokenService.validate.mockResolvedValue({
      tokenId: 'rt-1',
      actorType: RefreshTokenActorType.PLATFORM_USER,
      actorId: 'platform-2',
      familyId: 'fam-1',
      context: null,
      expiresAt: new Date(),
    });

    await expect(
      service.reissueSession('refresh-token-current', {
        platformUserId: 'platform-1',
        impersonatedLabId: null,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
