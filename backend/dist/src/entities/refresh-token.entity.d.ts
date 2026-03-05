export declare enum RefreshTokenActorType {
    LAB_USER = "LAB_USER",
    PLATFORM_USER = "PLATFORM_USER"
}
export declare class RefreshToken {
    id: string;
    actorType: RefreshTokenActorType;
    actorId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
    replacedByTokenId: string | null;
    context: Record<string, unknown> | null;
    createdIp: string | null;
    createdUserAgent: string | null;
    createdAt: Date;
    updatedAt: Date;
}
