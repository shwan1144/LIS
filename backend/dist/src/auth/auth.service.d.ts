import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Lab } from '../entities/lab.entity';
import { PlatformUser } from '../entities/platform-user.entity';
import { AdminLabPortalToken } from '../entities/admin-lab-portal-token.entity';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { AuditService } from '../audit/audit.service';
import { RefreshTokenService } from './refresh-token.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
export declare class AuthService {
    private readonly userRepository;
    private readonly labRepository;
    private readonly platformUserRepository;
    private readonly adminLabPortalTokenRepository;
    private readonly jwtService;
    private readonly auditService;
    private readonly refreshTokenService;
    private readonly authRateLimitService;
    constructor(userRepository: Repository<User>, labRepository: Repository<Lab>, platformUserRepository: Repository<PlatformUser>, adminLabPortalTokenRepository: Repository<AdminLabPortalToken>, jwtService: JwtService, auditService: AuditService, refreshTokenService: RefreshTokenService, authRateLimitService: AuthRateLimitService);
    login(dto: LoginDto, params?: {
        resolvedLabId?: string | null;
        ipAddress?: string | null;
        userAgent?: string | null;
    }): Promise<LoginResponseDto>;
    refreshLabToken(refreshToken: string, meta?: {
        resolvedLabId?: string | null;
        ipAddress?: string | null;
        userAgent?: string | null;
    }): Promise<LoginResponseDto>;
    logoutLabToken(refreshToken: string, resolvedLabId?: string | null): Promise<void>;
    issueLabPortalBridgeToken(params: {
        platformUserId: string;
        labId: string;
        ipAddress?: string | null;
        userAgent?: string | null;
    }): Promise<{
        bridgeToken: string;
        expiresAt: string;
        lab: {
            id: string;
            code: string;
            name: string;
            subdomain: string | null;
        };
    }>;
    loginWithLabPortalBridge(rawToken: string, params?: {
        resolvedLabId?: string | null;
        ipAddress?: string | null;
        userAgent?: string | null;
    }): Promise<LoginResponseDto>;
    private findUserForLogin;
    private resolveLabForUser;
    private getLabPortalBridgeTtlSeconds;
    private parseLabPortalBridgeToken;
    private hashLabPortalSecret;
    private constantTimeHashMatch;
    private normalizeIpAddress;
    private normalizeUserAgent;
    private logFailedLogin;
    private toUserDto;
    private toLabDto;
}
