import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformUser } from '../entities/platform-user.entity';
import type { AdminJwtPayload } from './admin-jwt-payload.interface';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'platform-jwt') {
  constructor(
    @InjectRepository(PlatformUser)
    private readonly platformUserRepo: Repository<PlatformUser>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.PLATFORM_JWT_SECRET || process.env.JWT_SECRET || 'platform-dev-secret',
    });
  }

  async validate(payload: AdminJwtPayload) {
    const platformUser = await this.platformUserRepo.findOne({
      where: { id: payload.sub, isActive: true },
    });
    if (!platformUser) {
      throw new UnauthorizedException();
    }
    return {
      platformUserId: platformUser.id,
      email: platformUser.email,
      role: platformUser.role,
      impersonatedLabId: payload.impersonatedLabId ?? null,
      impersonationStartedAt: payload.impersonationStartedAt ?? null,
    };
  }
}
