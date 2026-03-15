import { Request, Response } from 'express';
import { ReportActionKind, ReportsService } from './reports.service';
import { AuditService } from '../audit/audit.service';
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
export declare class ReportsController {
    private readonly reportsService;
    private readonly auditService;
    constructor(reportsService: ReportsService, auditService: AuditService);
    private setResultsPdfProfilingHeaders;
    getOrderActionFlags(req: RequestWithUser, orderIdsRaw: string | undefined, res: Response): Promise<Response<any, Record<string, any>>>;
    logReportAction(req: RequestWithUser & {
        ip?: string;
        headers?: Record<string, string | string[] | undefined>;
    }, orderId: string, body: {
        action?: ReportActionKind;
    }, res: Response): Promise<Response<any, Record<string, any>>>;
    getOrderReceiptPDF(req: RequestWithUser, orderId: string, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    getTestResultsPDF(req: Request & RequestWithUser, orderId: string, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    logReportDelivery(req: RequestWithUser & {
        ip?: string;
        headers?: Record<string, string | string[] | undefined>;
    }, orderId: string, body: {
        channel?: 'WHATSAPP' | 'VIBER';
    }, res: Response): Promise<Response<any, Record<string, any>>>;
    private logReportActionInternal;
}
export {};
