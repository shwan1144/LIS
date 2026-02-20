import { WorklistService } from './worklist.service';
interface RequestWithUser {
    user: {
        userId?: string | null;
        platformUserId?: string | null;
        isImpersonation?: boolean;
        username: string;
        labId: string;
        role?: string;
    };
}
export declare class WorklistController {
    private readonly worklistService;
    constructor(worklistService: WorklistService);
    getWorklist(req: RequestWithUser, status?: string, search?: string, date?: string, departmentId?: string, page?: string, size?: string): Promise<{
        items: import("./worklist.service").WorklistItem[];
        total: number;
    }>;
    getStats(req: RequestWithUser): Promise<{
        pending: number;
        completed: number;
        verified: number;
        rejected: number;
    }>;
    enterResult(req: RequestWithUser, id: string, body: {
        resultValue?: number | null;
        resultText?: string | null;
        comments?: string | null;
        resultParameters?: Record<string, string> | null;
        forceEditVerified?: boolean;
    }): Promise<import("../entities/order-test.entity").OrderTest>;
    verifyResult(req: RequestWithUser, id: string): Promise<import("../entities/order-test.entity").OrderTest>;
    verifyMultiple(req: RequestWithUser, body: {
        ids: string[];
    }): Promise<{
        verified: number;
        failed: number;
    }>;
    rejectResult(req: RequestWithUser, id: string, body: {
        reason: string;
    }): Promise<import("../entities/order-test.entity").OrderTest>;
}
export {};
