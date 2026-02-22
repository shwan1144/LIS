import { OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RequestRlsContextService } from './request-rls-context.service';
import { RlsSessionService } from './rls-session.service';
export declare class RlsQueryRunnerEnforcerService implements OnModuleInit {
    private readonly dataSource;
    private readonly requestRlsContextService;
    private readonly rlsSessionService;
    private readonly logger;
    private readonly patchedRunners;
    private dataSourcePatched;
    constructor(dataSource: DataSource, requestRlsContextService: RequestRlsContextService, rlsSessionService: RlsSessionService);
    onModuleInit(): void;
    private patchDataSourceCreateQueryRunner;
    private patchQueryRunner;
    private applyAutomaticRequestContext;
}
