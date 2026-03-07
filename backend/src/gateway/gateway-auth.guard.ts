import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GatewayAuthGuard extends AuthGuard('gateway-jwt') {}
