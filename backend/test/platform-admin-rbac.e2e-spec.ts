import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../src/auth/roles.guard';
import { PlatformAdminController } from '../src/platform-admin/platform-admin.controller';

type PlatformRole = 'SUPER_ADMIN' | 'AUDITOR' | undefined;

function buildContext(
  handlerName: keyof PlatformAdminController,
  role: PlatformRole,
): ExecutionContext {
  const handler = PlatformAdminController.prototype[handlerName] as (...args: unknown[]) => unknown;
  const reqUser = role ? { role } : undefined;

  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: reqUser }),
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    getClass: () => PlatformAdminController,
    getHandler: () => handler,
  } as unknown as ExecutionContext;
}

describe('Platform admin RBAC (e2e-style)', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard(new Reflector());
  });

  it('allows AUDITOR on read endpoint inherited from class role metadata', () => {
    const ctx = buildContext('listLabs', 'AUDITOR');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks AUDITOR on SUPER_ADMIN-only mutation endpoint', () => {
    const ctx = buildContext('createLab', 'AUDITOR');
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows SUPER_ADMIN on SUPER_ADMIN-only mutation endpoint', () => {
    const ctx = buildContext('createLab', 'SUPER_ADMIN');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks request without role metadata on protected endpoint', () => {
    const ctx = buildContext('setLabStatus', undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

