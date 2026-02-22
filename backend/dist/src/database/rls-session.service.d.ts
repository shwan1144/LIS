import { DataSource, EntityManager } from 'typeorm';
import { RequestRlsContext } from './request-rls-context.types';
type QueryExecutor = (query: string, parameters?: unknown[]) => Promise<unknown>;
export declare class RlsSessionService {
    private readonly dataSource;
    private readonly logger;
    private readonly warnedMissingRoles;
    private readonly warnedMembershipRoles;
    private readonly warnedMissingRolePrivileges;
    private readonly warnedResetFailures;
    constructor(dataSource: DataSource);
    withLabContext<T>(labId: string, execute: (manager: EntityManager) => Promise<T>): Promise<T>;
    withPlatformAdminContext<T>(execute: (manager: EntityManager) => Promise<T>): Promise<T>;
    applyRequestContextWithExecutor(executeQuery: QueryExecutor, context: RequestRlsContext, options?: {
        local?: boolean;
    }): Promise<boolean>;
    resetRequestContextWithExecutor(executeQuery: QueryExecutor): Promise<void>;
    private markRunnerSkipAutoContext;
    private trySetRole;
    private toBoolean;
}
export {};
