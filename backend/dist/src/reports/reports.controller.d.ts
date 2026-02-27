import { Response } from 'express';
import { ReportsService } from './reports.service';
import { AuditService } from '../audit/audit.service';
interface RequestWithUser {
    user: {
        userId?: string | null;
        platformUserId?: string | null;
        isImpersonation?: boolean;
        username: string;
        labId: string;
    };
}
export declare class ReportsController {
    private readonly reportsService;
    private readonly auditService;
    constructor(reportsService: ReportsService, auditService: AuditService);
    getOrderReceiptPDF(req: RequestWithUser, orderId: string, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    getTestResultsPDF(req: RequestWithUser, orderId: string, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    logReportDelivery(req: RequestWithUser & {
        ip?: string;
        headers?: Record<string, string | string[] | undefined>;
    }, orderId: string, body: {
        channel?: 'WHATSAPP' | 'VIBER';
    }, res: Response): Promise<Response<any, Record<string, any>>>;
}
export {};
