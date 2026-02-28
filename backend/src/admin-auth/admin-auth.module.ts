import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformUser } from '../entities/platform-user.entity';
import { AuthModule } from '../auth/auth.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtStrategy } from './admin-jwt.strategy';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';
import { requireSecret } from '../config/security-env';

const platformJwtAccessTtlSeconds = Number(process.env.PLATFORM_JWT_ACCESS_TTL || 36000);
const platformJwtSecret = requireSecret(
  'PLATFORM_JWT_SECRET',
  'platform-dev-secret',
  'AdminAuthModule',
);

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformUser]),
    PassportModule.register({ defaultStrategy: 'platform-jwt' }),
    JwtModule.register({
      secret: platformJwtSecret,
      signOptions: {
        expiresIn:
          Number.isFinite(platformJwtAccessTtlSeconds) && platformJwtAccessTtlSeconds > 0
            ? platformJwtAccessTtlSeconds
            : 36000,
      },
    }),
    AuthModule,
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminJwtStrategy, AdminJwtAuthGuard],
  exports: [AdminAuthService, AdminJwtAuthGuard],
})
export class AdminAuthModule { }
