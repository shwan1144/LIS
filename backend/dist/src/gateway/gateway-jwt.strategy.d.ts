import { Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { GatewayDevice } from '../entities/gateway.entity';
import type { GatewayJwtPayload } from './gateway-jwt-payload.interface';
declare const GatewayJwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class GatewayJwtStrategy extends GatewayJwtStrategy_base {
    private readonly gatewayRepo;
    constructor(gatewayRepo: Repository<GatewayDevice>);
    validate(payload: GatewayJwtPayload): Promise<{
        gatewayId: string;
        labId: string;
        scope: string[];
    }>;
}
export {};
