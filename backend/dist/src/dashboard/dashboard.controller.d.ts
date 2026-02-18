import { DashboardService, DashboardKpis, OrdersTrendPoint, StatisticsDto } from './dashboard.service';
interface RequestWithUser {
    user: {
        userId: string;
        username: string;
        labId: string;
        role?: string;
    };
}
export declare class DashboardController {
    private readonly dashboardService;
    constructor(dashboardService: DashboardService);
    getKpis(req: RequestWithUser): Promise<DashboardKpis>;
    getOrdersTrend(req: RequestWithUser, days?: string): Promise<{
        data: OrdersTrendPoint[];
    }>;
    getStatistics(req: RequestWithUser, startDateStr?: string, endDateStr?: string): Promise<StatisticsDto>;
    private emptyStatistics;
}
export {};
