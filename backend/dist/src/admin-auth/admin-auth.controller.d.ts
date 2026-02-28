import { RefreshTokenDto } from '../auth/dto/refresh-token.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminLoginResponseDto } from './dto/admin-login-response.dto';
import { AdminAuthService } from './admin-auth.service';
interface RequestWithMeta {
    ip?: string | null;
    headers: Record<string, string | string[] | undefined>;
}
export declare class AdminAuthController {
    private readonly adminAuthService;
    constructor(adminAuthService: AdminAuthService);
    login(req: RequestWithMeta, dto: AdminLoginDto): Promise<AdminLoginResponseDto>;
    refresh(req: RequestWithMeta, dto: RefreshTokenDto): Promise<AdminLoginResponseDto>;
    logout(dto: RefreshTokenDto): Promise<{
        ok: true;
    }>;
}
export {};
