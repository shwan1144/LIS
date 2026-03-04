import { WorklistEntryStatus, WorklistOrderMode, WorklistService, WorklistVerificationStatus, WorklistView } from './worklist.service';
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
    getWorklist(req: RequestWithUser, status?: string, search?: string, date?: string, departmentId?: string, page?: string, size?: string, view?: WorklistView): Promise<{
        items: import("./worklist.service").WorklistItem[];
        total: number;
    }>;
    getWorklistOrders(req: RequestWithUser, search?: string, date?: string, departmentId?: string, page?: string, size?: string, mode?: WorklistOrderMode, entryStatus?: WorklistEntryStatus, verificationStatus?: WorklistVerificationStatus): Promise<{
        items: import("./worklist.service").WorklistOrderSummaryItem[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    getWorklistOrderTests(req: RequestWithUser, orderId: string, departmentId?: string, mode?: WorklistOrderMode): Promise<import("./worklist.service").WorklistOrderTestsPayload>;
    getWorklistItemDetail(req: RequestWithUser, id: string): Promise<import("./worklist.service").WorklistItem>;
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
    batchEnterResults(req: RequestWithUser, body: {
        updates: Array<{
            orderTestId: string;
            resultValue?: number | null;
            resultText?: string | null;
            comments?: string | null;
            resultParameters?: Record<string, string> | null;
            forceEditVerified?: boolean;
        }>;
    }): Promise<import("../entities/order-test.entity").OrderTest[]>;
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
