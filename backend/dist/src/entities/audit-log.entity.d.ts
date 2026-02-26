import { User } from './user.entity';
import { Lab } from './lab.entity';
export declare enum AuditActorType {
    LAB_USER = "LAB_USER",
    PLATFORM_USER = "PLATFORM_USER"
}
export declare enum AuditAction {
    LOGIN = "LOGIN",
    LOGOUT = "LOGOUT",
    LOGIN_FAILED = "LOGIN_FAILED",
    PATIENT_CREATE = "PATIENT_CREATE",
    PATIENT_UPDATE = "PATIENT_UPDATE",
    ORDER_CREATE = "ORDER_CREATE",
    ORDER_UPDATE = "ORDER_UPDATE",
    ORDER_CANCEL = "ORDER_CANCEL",
    RESULT_ENTER = "RESULT_ENTER",
    RESULT_UPDATE = "RESULT_UPDATE",
    RESULT_VERIFY = "RESULT_VERIFY",
    RESULT_REJECT = "RESULT_REJECT",
    TEST_CREATE = "TEST_CREATE",
    TEST_UPDATE = "TEST_UPDATE",
    TEST_DELETE = "TEST_DELETE",
    USER_CREATE = "USER_CREATE",
    USER_UPDATE = "USER_UPDATE",
    USER_DELETE = "USER_DELETE",
    SHIFT_CREATE = "SHIFT_CREATE",
    SHIFT_UPDATE = "SHIFT_UPDATE",
    SHIFT_DELETE = "SHIFT_DELETE",
    DEPARTMENT_CREATE = "DEPARTMENT_CREATE",
    DEPARTMENT_UPDATE = "DEPARTMENT_UPDATE",
    DEPARTMENT_DELETE = "DEPARTMENT_DELETE",
    REPORT_GENERATE = "REPORT_GENERATE",
    REPORT_PRINT = "REPORT_PRINT",
    REPORT_EXPORT = "REPORT_EXPORT",
    PLATFORM_LOGIN = "PLATFORM_LOGIN",
    PLATFORM_LOGIN_FAILED = "PLATFORM_LOGIN_FAILED",
    PLATFORM_LAB_CREATE = "PLATFORM_LAB_CREATE",
    PLATFORM_LAB_UPDATE = "PLATFORM_LAB_UPDATE",
    PLATFORM_LAB_STATUS_CHANGE = "PLATFORM_LAB_STATUS_CHANGE",
    PLATFORM_SENSITIVE_READ = "PLATFORM_SENSITIVE_READ",
    PLATFORM_IMPERSONATE_START = "PLATFORM_IMPERSONATE_START",
    PLATFORM_IMPERSONATE_STOP = "PLATFORM_IMPERSONATE_STOP"
}
export declare class AuditLog {
    id: string;
    actorType: AuditActorType | null;
    actorId: string | null;
    labId: string | null;
    userId: string | null;
    action: AuditAction;
    entityType: string | null;
    entityId: string | null;
    oldValues: Record<string, unknown> | null;
    newValues: Record<string, unknown> | null;
    description: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
    user: User | null;
    lab: Lab | null;
}
