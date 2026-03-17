import type { Response } from 'express';
import { ReportsService } from './reports.service';
export declare class PublicReportsController {
    private readonly reportsService;
    constructor(reportsService: ReportsService);
    private applyNoStoreHeaders;
    private applyHtmlHeaders;
    getResultDocument(orderId: string, orderTestId: string, download: string | undefined, res: Response): Promise<Response<any, Record<string, any>>>;
    getResultStatusJson(orderId: string, res: Response): Promise<Response<any, Record<string, any>>>;
    getResultStatusPage(orderId: string, res: Response): Promise<void | Response<any, Record<string, any>>>;
    getResultPdf(orderId: string, res: Response): Promise<Response<any, Record<string, any>>>;
}
