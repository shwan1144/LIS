import { Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { PlatformUser } from '../entities/platform-user.entity';
import { SubLab } from '../entities/sub-lab.entity';
import type { JwtPayload } from './jwt-payload.interface';
import type { Request } from 'express';
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private readonly userRepository;
    private readonly platformUserRepository;
    private readonly subLabRepository;
    constructor(userRepository: Repository<User>, platformUserRepository: Repository<PlatformUser>, subLabRepository: Repository<SubLab>);
    validate(req: Request, payload: JwtPayload): Promise<{
        userId: null;
        username: string;
        labId: string;
        role: string;
        subLabId: null;
        isImpersonation: boolean;
        platformUserId: string;
    } | {
        userId: string;
        username: string;
        labId: string;
        role: string;
        subLabId: string | null;
        isImpersonation?: undefined;
        platformUserId?: undefined;
    }>;
}
export {};
