import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminHostGuard } from '../tenant/admin-host.guard';
import { RefreshTokenDto } from '../auth/dto/refresh-token.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminLoginResponseDto } from './dto/admin-login-response.dto';
import { AdminAuthService } from './admin-auth.service';

interface RequestWithMeta {
  ip?: string | null;
  headers: Record<string, string | string[] | undefined>;
}

@Controller('admin/auth')
@UseGuards(AdminHostGuard)
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async login(
    @Req() req: RequestWithMeta,
    @Body() dto: AdminLoginDto,
  ): Promise<AdminLoginResponseDto> {
    return this.adminAuthService.login(dto, {
      ipAddress: req.ip ?? null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });
  }

  @Post('refresh')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async refresh(
    @Req() req: RequestWithMeta,
    @Body() dto: RefreshTokenDto,
  ): Promise<AdminLoginResponseDto> {
    return this.adminAuthService.refresh(dto.refreshToken, {
      ipAddress: req.ip ?? null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });
  }

  @Post('logout')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async logout(@Body() dto: RefreshTokenDto): Promise<{ ok: true }> {
    await this.adminAuthService.logout(dto.refreshToken);
    return { ok: true };
  }
}

