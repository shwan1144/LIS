import { UnmatchedResultsService, ResolveUnmatchedDto } from './unmatched-results.service';
interface RequestWithUser {
    user: {
        userId?: string | null;
        platformUserId?: string | null;
        isImpersonation?: boolean;
        username: string;
        labId: string;
    };
}
export declare class UnmatchedResultsController {
    private readonly unmatchedService;
    constructor(unmatchedService: UnmatchedResultsService);
    findAll(req: RequestWithUser, status?: 'PENDING' | 'RESOLVED' | 'DISCARDED', instrumentId?: string, reason?: string, page?: string, size?: string): Promise<{
        items: import("../entities/unmatched-instrument-result.entity").UnmatchedInstrumentResult[];
        total: number;
    }>;
    getStats(req: RequestWithUser): Promise<{
        pending: number;
        resolved: number;
        discarded: number;
        byReason: Record<import("../entities/unmatched-instrument-result.entity").UnmatchedReason, number>;
    }>;
    findOne(req: RequestWithUser, id: string): Promise<import("../entities/unmatched-instrument-result.entity").UnmatchedInstrumentResult>;
    resolve(req: RequestWithUser, id: string, dto: ResolveUnmatchedDto): Promise<import("../entities/unmatched-instrument-result.entity").UnmatchedInstrumentResult>;
}
export {};
