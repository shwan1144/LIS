import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LabPortalLoginDto } from './dto/lab-portal-login.dto';
interface RequestWithTenant {
    labId?: string | null;
    ip?: string | null;
    headers: Record<string, string | string[] | undefined>;
}
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(req: RequestWithTenant, dto: LoginDto): Promise<LoginResponseDto>;
    refresh(req: RequestWithTenant, dto: RefreshTokenDto): Promise<LoginResponseDto>;
    logout(req: RequestWithTenant, dto: RefreshTokenDto): Promise<{
        ok: true;
    }>;
    portalLogin(req: RequestWithTenant, dto: LabPortalLoginDto): Promise<LoginResponseDto>;
}
export {};
