import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { requireSecret } from '../config/security-env';
import { GatewayDevice, GatewayDeviceStatus } from '../entities/gateway.entity';
import type { GatewayJwtPayload } from './gateway-jwt-payload.interface';

const gatewayJwtSecret = requireSecret(
  'JWT_SECRET',
  'lis-dev-secret-change-in-production',
  'GatewayJwtStrategy',
);

@Injectable()
export class GatewayJwtStrategy extends PassportStrategy(Strategy, 'gateway-jwt') {
  constructor(
    @InjectRepository(GatewayDevice)
    private readonly gatewayRepo: Repository<GatewayDevice>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: gatewayJwtSecret,
    });
  }

  async validate(payload: GatewayJwtPayload) {
    if (payload.tokenType !== 'gateway_access') {
      throw new UnauthorizedException('Invalid gateway token type');
    }

    const gateway = await this.gatewayRepo.findOne({
      where: { id: payload.sub },
    });

    if (!gateway || gateway.status === GatewayDeviceStatus.DISABLED) {
      throw new UnauthorizedException('Gateway not allowed');
    }

    if (payload.labId !== gateway.labId) {
      throw new UnauthorizedException('Gateway lab mismatch');
    }

    return {
      gatewayId: gateway.id,
      labId: gateway.labId,
      scope: Array.isArray(payload.scope) ? payload.scope : [],
    };
  }
}
