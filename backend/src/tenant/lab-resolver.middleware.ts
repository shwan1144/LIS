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
    const originHost = this.normalizeHost(this.extractOriginHost(req));
    const strictHostMode = this.isStrictTenantHostEnabled();
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

    let subdomain = this.extractLabSubdomain(host);
    if (subdomain === 'api' && originHost) {
      if (originHost === adminHost) {
        req.hostScope = HostScope.ADMIN;
        req.tenantHost = originHost;
        next();
        return;
      }
      if (strictHostMode) {
        throw new ForbiddenException('Ambiguous tenant host for API requests');
      }
      next();
      return;
    }

    if (subdomain === 'api') {
      if (strictHostMode) {
        throw new ForbiddenException('Ambiguous tenant host for API requests');
      }
      next();
      return;
    }

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
    if (!this.isTrustProxyEnabled(req)) {
      return req.hostname || '';
    }

    const strictHostMode = this.isStrictTenantHostEnabled();
    const forwardedHost = req.headers['x-forwarded-host'];
    let rawForwardedHost = '';
    if (typeof forwardedHost === 'string') {
      rawForwardedHost = forwardedHost.trim();
    } else if (Array.isArray(forwardedHost) && forwardedHost.length > 0) {
      rawForwardedHost = String(forwardedHost[0] ?? '').trim();
    }

    if (rawForwardedHost) {
      const forwardedHosts = rawForwardedHost
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);

      if (forwardedHosts.length > 0) {
        if (strictHostMode) {
          const distinctHosts = Array.from(new Set(forwardedHosts.map((item) => item.toLowerCase())));
          if (distinctHosts.length > 1) {
            throw new ForbiddenException('Ambiguous forwarded host chain');
          }
        }
        return forwardedHosts[0] ?? req.hostname;
      }
    }

    return req.hostname || '';
  }

  private normalizeHost(host: string): string {
    return host.toLowerCase().replace(/:\d+$/, '');
  }

  private extractOriginHost(req: Request): string {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin.trim()) {
      try {
        return new URL(origin).host;
      } catch {
        return '';
      }
    }
    const referer = req.headers.referer;
    if (typeof referer === 'string' && referer.trim()) {
      try {
        return new URL(referer).host;
      } catch {
        return '';
      }
    }
    return '';
  }

  private isTrustProxyEnabled(req: Request): boolean {
    const value = req.app?.get?.('trust proxy');
    if (value === true) return true;
    if (typeof value === 'number') return value > 0;
    if (typeof value === 'string') {
      return value.trim().length > 0 && value !== 'false' && value !== '0';
    }
    if (Array.isArray(value)) return value.length > 0;
    return false;
  }

  private isStrictTenantHostEnabled(): boolean {
    return (process.env.STRICT_TENANT_HOST || '').trim().toLowerCase() === 'true';
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
