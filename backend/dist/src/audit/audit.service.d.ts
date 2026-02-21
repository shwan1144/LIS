import { Repository } from 'typeorm';
import { AuditLog, AuditAction, AuditActorType } from '../entities/audit-log.entity';
import { User } from '../entities/user.entity';
import { Lab } from '../entities/lab.entity';
export interface AuditLogParams {
    labId?: string;
    userId?: string;
    action?: AuditAction | AuditAction[];
    entityType?: string;
    entityId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    size?: number;
}
export interface CreateAuditLogDto {
    actorType?: AuditActorType | null;
    actorId?: string | null;
    labId?: string | null;
    userId?: string | null;
    action: AuditAction;
    entityType?: string | null;
    entityId?: string | null;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    description?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
}
export declare class AuditService {
    private readonly auditLogRepo;
    private readonly userRepo;
    private readonly labRepo;
    constructor(auditLogRepo: Repository<AuditLog>, userRepo: Repository<User>, labRepo: Repository<Lab>);
    log(dto: CreateAuditLogDto): Promise<AuditLog>;
    private isForeignKeyViolation;
    findAll(labId: string, params: AuditLogParams): Promise<{
        items: AuditLog[];
        total: number;
    }>;
    getActions(): Promise<string[]>;
    getEntityTypes(labId: string): Promise<string[]>;
}
