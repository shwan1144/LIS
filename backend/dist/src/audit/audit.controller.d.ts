import { AuditService } from './audit.service';
interface RequestWithUser {
    user: {
        userId: string;
        username: string;
        labId: string;
    };
}
export declare class AuditController {
    private readonly auditService;
    constructor(auditService: AuditService);
    findAll(req: RequestWithUser, userId?: string, action?: string, entityType?: string, entityId?: string, startDate?: string, endDate?: string, search?: string, page?: string, size?: string): Promise<{
        items: import("../entities/audit-log.entity").AuditLog[];
        total: number;
    }>;
    getActions(): Promise<string[]>;
    getEntityTypes(req: RequestWithUser): Promise<string[]>;
}
export {};
