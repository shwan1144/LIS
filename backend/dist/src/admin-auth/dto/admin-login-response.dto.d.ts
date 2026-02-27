import { PlatformUserRole } from '../../entities/platform-user.entity';
export declare class PlatformUserDto {
    id: string;
    email: string;
    role: PlatformUserRole;
}
export declare class AdminLoginResponseDto {
    accessToken: string;
    refreshToken: string;
    platformUser: PlatformUserDto;
}
