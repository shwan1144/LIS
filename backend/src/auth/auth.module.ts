import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { Lab } from '../entities/lab.entity';
import { PlatformUser } from '../entities/platform-user.entity';
import { AdminLabPortalToken } from '../entities/admin-lab-portal-token.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { RefreshTokenService } from './refresh-token.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { requireSecret } from '../config/security-env';

const jwtAccessTtlSeconds = Number(process.env.JWT_ACCESS_TTL || 36000);
const jwtSecret = requireSecret(
  'JWT_SECRET',
  'lis-dev-secret-change-in-production',
  'AuthModule',
);

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      RefreshToken,
      AuditLog,
      Lab,
      PlatformUser,
      AdminLabPortalToken,
    ]),
    PassportModule.register({ defaultStrategy: 'lab-jwt' }),
    JwtModule.register({
      secret: jwtSecret,
      signOptions: {
        expiresIn: Number.isFinite(jwtAccessTtlSeconds) && jwtAccessTtlSeconds > 0 ? jwtAccessTtlSeconds : 36000,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    RefreshTokenService,
    AuthRateLimitService,
  ],
  exports: [
    AuthService,
    JwtModule,
    JwtAuthGuard,
    RolesGuard,
    RefreshTokenService,
    AuthRateLimitService,
  ],
})
export class AuthModule { }
