"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLabActorContext = buildLabActorContext;
const audit_log_entity_1 = require("../entities/audit-log.entity");
function buildLabActorContext(user) {
    const platformUserId = user.platformUserId?.trim() || null;
    const isImpersonation = Boolean(user.isImpersonation) || Boolean(platformUserId);
    const userId = !isImpersonation && user.userId ? user.userId : null;
    if (isImpersonation) {
        return {
            userId: null,
            actorType: audit_log_entity_1.AuditActorType.PLATFORM_USER,
            actorId: platformUserId,
            isImpersonation: true,
            platformUserId,
        };
    }
    return {
        userId,
        actorType: audit_log_entity_1.AuditActorType.LAB_USER,
        actorId: userId,
        isImpersonation: false,
        platformUserId: null,
    };
}
//# sourceMappingURL=lab-actor-context.js.map