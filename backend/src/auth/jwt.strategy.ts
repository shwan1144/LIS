import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { PlatformUser } from '../entities/platform-user.entity';
import type { JwtPayload } from './jwt-payload.interface';
import type { Request } from 'express';
import { requireSecret } from '../config/security-env';

const jwtSecret = requireSecret(
  'JWT_SECRET',
  'lis-dev-secret-change-in-production',
  'JwtStrategy',
);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'lab-jwt') {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PlatformUser)
    private readonly platformUserRepository: Repository<PlatformUser>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    if (payload.tokenType === 'lab_impersonation_access') {
      const platformUserId = payload.platformUserId?.trim() || payload.sub;
      const platformUser = await this.platformUserRepository.findOne({
        where: { id: platformUserId, isActive: true },
      });
      if (!platformUser) {
        throw new UnauthorizedException();
      }
      if (req.labId && payload.labId !== req.labId) {
        throw new UnauthorizedException('Invalid token for subdomain lab');
      }
      return {
        userId: null,
        username: platformUser.email,
        labId: payload.labId,
        role: 'SUPER_ADMIN',
        isImpersonation: true,
        platformUserId: platformUser.id,
      };
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub, isActive: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.labId && payload.labId !== user.labId) {
      throw new UnauthorizedException('Token lab mismatch');
    }
    if (req.labId && payload.labId !== req.labId) {
      throw new UnauthorizedException('Invalid token for subdomain lab');
    }
    return {
      userId: payload.sub,
      username: payload.username,
      labId: payload.labId,
      role: user.role,
    };
  }
}
