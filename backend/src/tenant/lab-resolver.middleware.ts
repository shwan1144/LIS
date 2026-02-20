import {
  Injectable,
  NestMiddleware,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lab } from '../entities/lab.entity';
import { HostScope } from './host-scope.enum';

@Injectable()
export class LabResolverMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(Lab)
    private readonly labRepo: Repository<Lab>,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const host = this.normalizeHost(this.extractHost(req));
    req.tenantHost = host;
    req.hostScope = HostScope.UNKNOWN;
    req.tenantSubdomain = null;
    req.lab = null;
    req.labId = null;

    const adminHost = this.getAdminHost();
    if (host === adminHost) {
      req.hostScope = HostScope.ADMIN;
      next();
      return;
    }

    const subdomain = this.extractLabSubdomain(host);
    if (!subdomain) {
      next();
      return;
    }

    const lab = await this.labRepo.findOne({
      where: [{ subdomain }, { code: subdomain.toUpperCase() }],
    });
    if (!lab) {
      throw new NotFoundException('Laboratory not found for this subdomain');
    }
    if (!lab.isActive) {
      throw new ForbiddenException('Laboratory is disabled');
    }

    req.hostScope = HostScope.LAB;
    req.tenantSubdomain = subdomain;
    req.lab = lab;
    req.labId = lab.id;
    next();
  }

  private extractHost(req: Request): string {
    const forwardedHost = req.headers['x-forwarded-host'];
    if (typeof forwardedHost === 'string' && forwardedHost.trim()) {
      return forwardedHost.trim().split(',')[0]?.trim() ?? req.hostname;
    }
    if (Array.isArray(forwardedHost) && forwardedHost.length > 0) {
      return forwardedHost[0] ?? req.hostname;
    }
    return req.hostname || '';
  }

  private normalizeHost(host: string): string {
    return host.toLowerCase().replace(/:\d+$/, '');
  }

  private getAdminHost(): string {
    const explicit = (process.env.APP_ADMIN_HOST || '').trim().toLowerCase();
    if (explicit) return explicit;
    const base = (process.env.APP_BASE_DOMAIN || '').trim().toLowerCase();
    if (base) return `admin.${base}`;
    return 'admin.localhost';
  }

  private extractLabSubdomain(host: string): string | null {
    if (!host) return null;
    const adminHost = this.getAdminHost();
    if (host === adminHost) return null;

    if (host.endsWith('.localhost')) {
      const sub = host.split('.')[0];
      return sub && sub !== 'admin' ? sub : null;
    }

    const baseDomain = (process.env.APP_BASE_DOMAIN || '').trim().toLowerCase();
    if (baseDomain && host.endsWith(`.${baseDomain}`)) {
      const sub = host.slice(0, host.length - (`.${baseDomain}`).length);
      if (!sub || sub === 'admin' || sub.includes('.')) return null;
      return sub;
    }

    return null;
  }
}

