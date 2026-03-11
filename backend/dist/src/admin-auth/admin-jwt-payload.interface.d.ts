import { PlatformUserRole } from '../entities/platform-user.entity';
export interface AdminJwtPayload {
    sub: string;
    email: string;
    role: PlatformUserRole;
    tokenType?: 'platform_access';
    impersonatedLabId?: string;
    impersonationStartedAt?: string;
}
