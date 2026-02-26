import type { Response } from 'express';
import { ReportsService } from './reports.service';
export declare class PublicReportsController {
    private readonly reportsService;
    constructor(reportsService: ReportsService);
    getResultStatusPage(orderId: string, res: Response): Promise<Response<any, Record<string, any>>>;
    getResultPdf(orderId: string, res: Response): Promise<Response<any, Record<string, any>>>;
}
