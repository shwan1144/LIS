import { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { Repository } from 'typeorm';
import { Lab } from '../entities/lab.entity';
export declare class LabResolverMiddleware implements NestMiddleware {
    private readonly labRepo;
    constructor(labRepo: Repository<Lab>);
    use(req: Request, _res: Response, next: NextFunction): Promise<void>;
    private extractHost;
    private normalizeHost;
    private extractOriginHost;
    private getAdminHost;
    private extractLabSubdomain;
}
