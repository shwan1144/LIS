import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { PlatformUser } from '../entities/platform-user.entity';
import { AuditService } from '../audit/audit.service';
import { RefreshTokenService } from '../auth/refresh-token.service';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminLoginResponseDto, PlatformUserDto } from './dto/admin-login-response.dto';
export declare class AdminAuthService {
    private readonly platformUserRepo;
    private readonly jwtService;
    private readonly refreshTokenService;
    private readonly auditService;
    private readonly authRateLimitService;
    constructor(platformUserRepo: Repository<PlatformUser>, jwtService: JwtService, refreshTokenService: RefreshTokenService, auditService: AuditService, authRateLimitService: AuthRateLimitService);
    login(dto: AdminLoginDto, meta?: {
        ipAddress?: string | null;
        userAgent?: string | null;
    }): Promise<AdminLoginResponseDto>;
    refresh(refreshToken: string, meta?: {
        ipAddress?: string | null;
        userAgent?: string | null;
    }): Promise<AdminLoginResponseDto>;
    logout(refreshToken: string): Promise<void>;
    issueAccessTokenByPlatformUserId(platformUserId: string, options?: {
        impersonatedLabId?: string | null;
    }): Promise<{
        accessToken: string;
        platformUser: PlatformUserDto;
    }>;
    issueAccessToken(platformUser: PlatformUser, options?: {
        impersonatedLabId?: string | null;
    }): string;
    private toPlatformUserDto;
    private buildAccessPayload;
    private logFailed;
}
