import { DataSource, EntityManager } from 'typeorm';
export declare class RlsSessionService {
    private readonly dataSource;
    private readonly logger;
    private readonly warnedMissingRoles;
    private readonly warnedMembershipRoles;
    constructor(dataSource: DataSource);
    withLabContext<T>(labId: string, execute: (manager: EntityManager) => Promise<T>): Promise<T>;
    withPlatformAdminContext<T>(execute: (manager: EntityManager) => Promise<T>): Promise<T>;
    private trySetLocalRole;
}
