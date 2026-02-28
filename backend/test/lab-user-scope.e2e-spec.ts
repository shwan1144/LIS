import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { HostScope } from '../src/tenant/host-scope.enum';
import { LabUserScopeGuard } from '../src/tenant/lab-user-scope.guard';

function buildContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    getClass: () => Object,
    getHandler: () => (() => undefined) as () => void,
  } as unknown as ExecutionContext;
}

describe('LabUserScopeGuard (e2e-style)', () => {
  let guard: LabUserScopeGuard;

  beforeEach(() => {
    guard = new LabUserScopeGuard();
  });

  it('blocks token lab mismatch', () => {
    const req = {
      path: '/orders',
      user: { labId: 'lab-1', role: 'LAB_ADMIN' },
      hostScope: HostScope.LAB,
      labId: 'lab-2',
    };
    const context = buildContext(req);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('blocks lab token on non-lab host', () => {
    const req = {
      path: '/orders',
      user: { labId: 'lab-1', role: 'LAB_ADMIN' },
      hostScope: HostScope.ADMIN,
      labId: null,
    };
    const context = buildContext(req);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows when lab context matches token', () => {
    const req = {
      path: '/orders',
      user: { labId: 'lab-1', role: 'LAB_ADMIN' },
      hostScope: HostScope.LAB,
      labId: 'lab-1',
    };
    const context = buildContext(req);

    expect(guard.canActivate(context)).toBe(true);
  });
});
