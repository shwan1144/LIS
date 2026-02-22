import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestRlsContextService } from '../database/request-rls-context.service';
import { RequestRlsContext } from '../database/request-rls-context.types';
import { HostScope } from './host-scope.enum';

@Injectable()
export class TenantRlsContextMiddleware implements NestMiddleware {
  constructor(private readonly requestRlsContextService: RequestRlsContextService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const context: RequestRlsContext = this.resolveContext(req);
    this.requestRlsContextService.runWithContext(context, () => next());
  }

  private resolveContext(req: Request): RequestRlsContext {
    if (req.hostScope === HostScope.LAB && req.labId) {
      return { scope: 'lab', labId: req.labId };
    }
    if (req.hostScope === HostScope.ADMIN) {
      return { scope: 'admin', labId: null };
    }
    return { scope: 'none', labId: null };
  }
}
