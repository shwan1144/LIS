import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Repository } from 'typeorm';
import { Lab } from '../entities/lab.entity';
import { HostScope } from './host-scope.enum';
import { LabResolverMiddleware } from './lab-resolver.middleware';

function buildRequest(hostname: string, forwardedHost?: string): Request {
  return {
    headers: forwardedHost ? { 'x-forwarded-host': forwardedHost } : {},
    hostname,
  } as unknown as Request;
}

describe('LabResolverMiddleware', () => {
  const originalBaseDomain = process.env.APP_BASE_DOMAIN;
  const originalAdminHost = process.env.APP_ADMIN_HOST;
  let repo: Pick<Repository<Lab>, 'findOne'>;
  let middleware: LabResolverMiddleware;

  beforeEach(() => {
    process.env.APP_BASE_DOMAIN = 'yourlis.local';
    process.env.APP_ADMIN_HOST = 'admin.yourlis.local';
    repo = {
      findOne: jest.fn(),
    };
    middleware = new LabResolverMiddleware(repo as Repository<Lab>);
  });

  afterEach(() => {
    process.env.APP_BASE_DOMAIN = originalBaseDomain;
    process.env.APP_ADMIN_HOST = originalAdminHost;
    jest.clearAllMocks();
  });

  it('marks admin host as admin scope', async () => {
    const req = buildRequest('admin.yourlis.local');
    const next = jest.fn();

    await middleware.use(req, {} as Response, next);

    expect(req.hostScope).toBe(HostScope.ADMIN);
    expect(req.labId).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('resolves lab by subdomain and sets lab context', async () => {
    const req = buildRequest('lab1.yourlis.local');
    const next = jest.fn();
    (repo.findOne as jest.Mock).mockResolvedValue({
      id: 'lab-id-1',
      subdomain: 'lab1',
      code: 'LAB1',
      isActive: true,
    } as Lab);

    await middleware.use(req, {} as Response, next);

    expect(repo.findOne).toHaveBeenCalled();
    expect(req.hostScope).toBe(HostScope.LAB);
    expect(req.tenantSubdomain).toBe('lab1');
    expect(req.labId).toBe('lab-id-1');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws NotFound for unknown subdomain', async () => {
    const req = buildRequest('missing.yourlis.local');
    const next = jest.fn();
    (repo.findOne as jest.Mock).mockResolvedValue(null);

    await expect(middleware.use(req, {} as Response, next)).rejects.toBeInstanceOf(NotFoundException);
    expect(next).not.toHaveBeenCalled();
  });

  it('throws Forbidden when lab is disabled', async () => {
    const req = buildRequest('lab2.yourlis.local');
    const next = jest.fn();
    (repo.findOne as jest.Mock).mockResolvedValue({
      id: 'lab-id-2',
      subdomain: 'lab2',
      code: 'LAB2',
      isActive: false,
    } as Lab);

    await expect(middleware.use(req, {} as Response, next)).rejects.toBeInstanceOf(ForbiddenException);
    expect(next).not.toHaveBeenCalled();
  });

  it('keeps unknown host scope when host does not match configured base domain', async () => {
    const req = buildRequest('localhost');
    const next = jest.fn();

    await middleware.use(req, {} as Response, next);

    expect(req.hostScope).toBe(HostScope.UNKNOWN);
    expect(req.labId).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
    expect(repo.findOne).not.toHaveBeenCalled();
  });
});
