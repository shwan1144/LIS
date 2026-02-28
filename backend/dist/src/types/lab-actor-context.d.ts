import { AuditActorType } from '../entities/audit-log.entity';
export interface LabActorContext {
    userId: string | null;
    actorType: AuditActorType;
    actorId: string | null;
    isImpersonation: boolean;
    platformUserId: string | null;
}
export declare function buildLabActorContext(user: {
    userId?: string | null;
    platformUserId?: string | null;
    isImpersonation?: boolean;
}): LabActorContext;
