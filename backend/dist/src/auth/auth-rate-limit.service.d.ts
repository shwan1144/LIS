import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
export declare class AuthRateLimitService {
    private readonly auditLogRepo;
    constructor(auditLogRepo: Repository<AuditLog>);
    private readonly rateWindowSeconds;
    private readonly rateMaxAttemptsPerIp;
    private readonly failedWindowSeconds;
    private readonly failedMaxPerIp;
    private readonly failedMaxPerIdentifier;
    assertLabLoginAllowed(params: {
        username: string;
        labId?: string | null;
        ipAddress?: string | null;
    }): Promise<void>;
    assertPlatformLoginAllowed(params: {
        email: string;
        ipAddress?: string | null;
    }): Promise<void>;
    private countByIp;
    private countFailedLabByIdentifier;
    private countFailedPlatformByIdentifier;
    private cutoff;
    private tooManyRequestsMessage;
    private readPositiveInt;
}
