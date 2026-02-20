import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { HostScope } from '../src/tenant/host-scope.enum';
import { AdminHostGuard } from '../src/tenant/admin-host.guard';
import { LabHostGuard } from '../src/tenant/lab-host.guard';
import { LabApiController } from '../src/lab-api/lab-api.controller';

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

describe('Admin/Lab scope boundary (e2e-style)', () => {
  it('allows admin endpoints only on admin scope', () => {
    const guard = new AdminHostGuard();

    expect(guard.canActivate(buildContext({ hostScope: HostScope.ADMIN }))).toBe(true);
    expect(() => guard.canActivate(buildContext({ hostScope: HostScope.LAB, labId: 'lab-1' }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows lab endpoints only on lab scope with resolved lab', () => {
    const guard = new LabHostGuard();

    expect(guard.canActivate(buildContext({ hostScope: HostScope.LAB, labId: 'lab-1' }))).toBe(true);
    expect(() => guard.canActivate(buildContext({ hostScope: HostScope.ADMIN }))).toThrow(
      ForbiddenException,
    );
  });

  it('lab API orders list always uses token labId context', async () => {
    const service = {
      listOrders: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        size: 20,
        totalPages: 0,
      }),
    };
    const controller = new LabApiController(service as never);
    const req = { user: { userId: 'u1', labId: 'lab-token-1', role: 'LAB_ADMIN' } };

    await controller.listOrders(req, '1', '20', undefined);

    expect(service.listOrders).toHaveBeenCalledWith('lab-token-1', {
      page: 1,
      size: 20,
      status: undefined,
    });
  });
});

