import { DashboardService, DashboardKpis, OrdersTrendPoint, StatisticsDto } from './dashboard.service';
import { StatisticsQueryDto } from './dto/statistics-query.dto';
import { Response } from 'express';
import { AuditService } from '../audit/audit.service';
interface RequestWithUser {
    user: {
        userId?: string | null;
        username: string;
        labId: string;
        role?: string;
        platformUserId?: string | null;
        isImpersonation?: boolean;
    };
    ip?: string;
    headers?: Record<string, string | string[] | undefined>;
}
export declare class DashboardController {
    private readonly dashboardService;
    private readonly auditService;
    constructor(dashboardService: DashboardService, auditService: AuditService);
    getKpis(req: RequestWithUser): Promise<DashboardKpis>;
    getOrdersTrend(req: RequestWithUser, days?: string): Promise<{
        data: OrdersTrendPoint[];
    }>;
    getStatistics(req: RequestWithUser, query: StatisticsQueryDto): Promise<StatisticsDto>;
    getStatisticsPdf(req: RequestWithUser, query: StatisticsQueryDto, res: Response): Promise<Response<any, Record<string, any>>>;
    private emptyStatistics;
    private resolveRange;
    private toSafeFileToken;
}
export {};
