import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { RequestRlsContextService } from '../database/request-rls-context.service';
import { HostScope } from './host-scope.enum';
import { TenantRlsContextMiddleware } from './tenant-rls-context.middleware';

describe('TenantRlsContextMiddleware', () => {
  let middleware: TenantRlsContextMiddleware;
  let requestRlsContextService: RequestRlsContextService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TenantRlsContextMiddleware, RequestRlsContextService],
    }).compile();

    middleware = moduleRef.get(TenantRlsContextMiddleware);
    requestRlsContextService = moduleRef.get(RequestRlsContextService);
  });

  const createRequest = (overrides: Partial<Request>): Request =>
    ({
      hostScope: HostScope.UNKNOWN,
      labId: null,
      ...overrides,
    }) as Request;

  it('sets lab context for lab-scoped requests', () => {
    const req = createRequest({ hostScope: HostScope.LAB, labId: 'lab-123' });
    let insideContext: ReturnType<RequestRlsContextService['getContext']> | null = null;

    middleware.use(req, {} as never, () => {
      insideContext = requestRlsContextService.getContext();
    });

    expect(insideContext).toEqual({ scope: 'lab', labId: 'lab-123' });
  });

  it('sets admin context for admin-scoped requests', () => {
    const req = createRequest({ hostScope: HostScope.ADMIN, labId: null });
    let insideContext: ReturnType<RequestRlsContextService['getContext']> | null = null;

    middleware.use(req, {} as never, () => {
      insideContext = requestRlsContextService.getContext();
    });

    expect(insideContext).toEqual({ scope: 'admin', labId: null });
  });

  it('falls back to none context for unknown requests', () => {
    const req = createRequest({ hostScope: HostScope.UNKNOWN, labId: null });
    let insideContext: ReturnType<RequestRlsContextService['getContext']> | null = null;

    middleware.use(req, {} as never, () => {
      insideContext = requestRlsContextService.getContext();
    });

    expect(insideContext).toEqual({ scope: 'none', labId: null });
  });
});
