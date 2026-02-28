import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LabPortalLoginDto } from './dto/lab-portal-login.dto';
import { LabHostGuard } from '../tenant/lab-host.guard';

interface RequestWithTenant {
  labId?: string | null;
  ip?: string | null;
  headers: Record<string, string | string[] | undefined>;
}

@Controller('auth')
@UseGuards(LabHostGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async login(@Req() req: RequestWithTenant, @Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto, {
      resolvedLabId: req.labId ?? null,
      ipAddress: req.ip ?? null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });
  }

  @Post('refresh')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async refresh(
    @Req() req: RequestWithTenant,
    @Body() dto: RefreshTokenDto,
  ): Promise<LoginResponseDto> {
    return this.authService.refreshLabToken(dto.refreshToken, {
      resolvedLabId: req.labId ?? null,
      ipAddress: req.ip ?? null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });
  }

  @Post('logout')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async logout(@Req() req: RequestWithTenant, @Body() dto: RefreshTokenDto): Promise<{ ok: true }> {
    await this.authService.logoutLabToken(dto.refreshToken, req.labId ?? null);
    return { ok: true };
  }

  @Post('portal-login')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async portalLogin(
    @Req() req: RequestWithTenant,
    @Body() dto: LabPortalLoginDto,
  ): Promise<LoginResponseDto> {
    return this.authService.loginWithLabPortalBridge(dto.token, {
      resolvedLabId: req.labId ?? null,
      ipAddress: req.ip ?? null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });
  }
}
