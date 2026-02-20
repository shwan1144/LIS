import { PlatformUserRole } from '../../entities/platform-user.entity';

export class PlatformUserDto {
  id: string;
  email: string;
  role: PlatformUserRole;
}

export class AdminLoginResponseDto {
  accessToken: string;
  refreshToken: string;
  platformUser: PlatformUserDto;
}

