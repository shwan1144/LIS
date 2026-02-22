import { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestRlsContextService } from '../database/request-rls-context.service';
export declare class TenantRlsContextMiddleware implements NestMiddleware {
    private readonly requestRlsContextService;
    constructor(requestRlsContextService: RequestRlsContextService);
    use(req: Request, _res: Response, next: NextFunction): void;
    private resolveContext;
}
