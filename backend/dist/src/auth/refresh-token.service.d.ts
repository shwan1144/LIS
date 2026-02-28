import { Repository } from 'typeorm';
import { RefreshToken, RefreshTokenActorType } from '../entities/refresh-token.entity';
export interface RefreshTokenIssueResult {
    token: string;
    tokenId: string;
    familyId: string;
    expiresAt: Date;
}
export interface RefreshTokenRotationResult {
    actorType: RefreshTokenActorType;
    actorId: string;
    context: Record<string, unknown> | null;
    issued: RefreshTokenIssueResult;
}
export interface RefreshTokenValidationResult {
    tokenId: string;
    actorType: RefreshTokenActorType;
    actorId: string;
    familyId: string;
    context: Record<string, unknown> | null;
    expiresAt: Date;
}
export declare class RefreshTokenService {
    private readonly refreshTokenRepo;
    constructor(refreshTokenRepo: Repository<RefreshToken>);
    issue(params: {
        actorType: RefreshTokenActorType;
        actorId: string;
        familyId?: string;
        context?: Record<string, unknown> | null;
        ipAddress?: string | null;
        userAgent?: string | null;
    }): Promise<RefreshTokenIssueResult>;
    private issueWithRepository;
    rotate(rawToken: string, meta?: {
        ipAddress?: string | null;
        userAgent?: string | null;
    }): Promise<RefreshTokenRotationResult>;
    revoke(rawToken: string): Promise<void>;
    validate(rawToken: string): Promise<RefreshTokenValidationResult>;
    revokeFamily(familyId: string): Promise<void>;
    private revokeFamilyWithRepository;
    private revokeToken;
    private composeRawToken;
    private parseRawToken;
    private generateTokenSecret;
    private buildExpiryDate;
}
