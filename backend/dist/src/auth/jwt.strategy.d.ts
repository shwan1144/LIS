import { Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { PlatformUser } from '../entities/platform-user.entity';
import type { JwtPayload } from './jwt-payload.interface';
import type { Request } from 'express';
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private readonly userRepository;
    private readonly platformUserRepository;
    constructor(userRepository: Repository<User>, platformUserRepository: Repository<PlatformUser>);
    validate(req: Request, payload: JwtPayload): Promise<{
        userId: null;
        username: string;
        labId: string;
        role: string;
        isImpersonation: boolean;
        platformUserId: string;
    } | {
        userId: string;
        username: string;
        labId: string;
        role: string;
        isImpersonation?: undefined;
        platformUserId?: undefined;
    }>;
}
export {};
