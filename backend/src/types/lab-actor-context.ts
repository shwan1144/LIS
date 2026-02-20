import { AuditActorType } from '../entities/audit-log.entity';

export interface LabActorContext {
  userId: string | null;
  actorType: AuditActorType;
  actorId: string | null;
  isImpersonation: boolean;
  platformUserId: string | null;
}

export function buildLabActorContext(user: {
  userId?: string | null;
  platformUserId?: string | null;
  isImpersonation?: boolean;
}): LabActorContext {
  const platformUserId = user.platformUserId?.trim() || null;
  const isImpersonation = Boolean(user.isImpersonation) || Boolean(platformUserId);
  const userId = !isImpersonation && user.userId ? user.userId : null;

  if (isImpersonation) {
    return {
      userId: null,
      actorType: AuditActorType.PLATFORM_USER,
      actorId: platformUserId,
      isImpersonation: true,
      platformUserId,
    };
  }

  return {
    userId,
    actorType: AuditActorType.LAB_USER,
    actorId: userId,
    isImpersonation: false,
    platformUserId: null,
  };
}
