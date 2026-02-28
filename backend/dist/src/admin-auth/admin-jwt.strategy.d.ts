import { Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { PlatformUser } from '../entities/platform-user.entity';
import type { AdminJwtPayload } from './admin-jwt-payload.interface';
declare const AdminJwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class AdminJwtStrategy extends AdminJwtStrategy_base {
    private readonly platformUserRepo;
    constructor(platformUserRepo: Repository<PlatformUser>);
    validate(payload: AdminJwtPayload): Promise<{
        platformUserId: string;
        email: string;
        role: import("../entities/platform-user.entity").PlatformUserRole;
        impersonatedLabId: string | null;
        impersonationStartedAt: string | null;
    }>;
}
export {};
