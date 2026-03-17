import { Repository } from 'typeorm';
import { SubLab } from '../entities/sub-lab.entity';
import { SubLabTestPrice } from '../entities/sub-lab-test-price.entity';
import { User } from '../entities/user.entity';
import { Test } from '../entities/test.entity';
import { Order } from '../entities/order.entity';
import { OrdersService, type OrderListQueryParams } from '../orders/orders.service';
import { ReportsService } from '../reports/reports.service';
import { DashboardService } from '../dashboard/dashboard.service';
export declare class SubLabsService {
    private readonly subLabRepo;
    private readonly subLabTestPriceRepo;
    private readonly userRepo;
    private readonly testRepo;
    private readonly orderRepo;
    private readonly ordersService;
    private readonly reportsService;
    private readonly dashboardService;
    constructor(subLabRepo: Repository<SubLab>, subLabTestPriceRepo: Repository<SubLabTestPrice>, userRepo: Repository<User>, testRepo: Repository<Test>, orderRepo: Repository<Order>, ordersService: OrdersService, reportsService: ReportsService, dashboardService: DashboardService);
    listForLab(labId: string): Promise<{
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        username: string | null;
        priceCount: number;
    }[]>;
    listActiveOptions(labId: string): Promise<SubLab[]>;
    getForLab(labId: string, id: string): Promise<{
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        username: string | null;
        prices: {
            id: string;
            testId: string;
            price: number;
        }[];
    }>;
    createForLab(labId: string, data: {
        name: string;
        username: string;
        password?: string;
        isActive?: boolean;
        prices?: Array<{
            testId: string;
            price: number;
        }>;
    }): Promise<{
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        username: string | null;
        prices: {
            id: string;
            testId: string;
            price: number;
        }[];
    }>;
    updateForLab(labId: string, id: string, data: {
        name: string;
        username: string;
        password?: string;
        isActive?: boolean;
        prices?: Array<{
            testId: string;
            price: number;
        }>;
    }): Promise<{
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        username: string | null;
        prices: {
            id: string;
            testId: string;
            price: number;
        }[];
    }>;
    archiveForLab(labId: string, id: string): Promise<{
        success: boolean;
    }>;
    getPortalProfile(labId: string, subLabId: string): Promise<{
        id: string;
        name: string;
        labId: string;
    }>;
    listPortalOrders(labId: string, subLabId: string, params: OrderListQueryParams): Promise<{
        items: import("../orders/orders.service").OrderHistoryItem[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    getPortalOrderDetail(labId: string, subLabId: string, orderId: string): Promise<Order>;
    getPortalStatistics(labId: string, subLabId: string, startDate: Date, endDate: Date): Promise<import("../dashboard/dashboard.service").StatisticsDto>;
    generatePortalResultsPdf(labId: string, subLabId: string, orderId: string): Promise<void>;
    private requireActiveSubLab;
    private getForLabWithManager;
    private upsertSubLabUser;
    private replaceSubLabPrices;
    private assertTestsBelongToLab;
    private calculatePortalProgress;
    private buildPortalResultSummary;
    private formatPortalOrderTestSummary;
    private stripPortalResults;
}
