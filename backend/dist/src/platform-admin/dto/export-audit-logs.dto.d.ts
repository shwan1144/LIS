import { AuditAction, AuditActorType } from '../../entities/audit-log.entity';
export declare class ExportAuditLogsDto {
    labId?: string;
    actorType?: AuditActorType;
    action?: AuditAction;
    entityType?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    maxRows?: number;
    reason: string;
}
