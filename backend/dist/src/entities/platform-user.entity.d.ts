export declare enum PlatformUserRole {
    SUPER_ADMIN = "SUPER_ADMIN",
    AUDITOR = "AUDITOR"
}
export declare class PlatformUser {
    id: string;
    email: string;
    passwordHash: string;
    role: PlatformUserRole;
    isActive: boolean;
    mfaSecret: string | null;
    createdAt: Date;
    updatedAt: Date;
}
