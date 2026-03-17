import { Response } from 'express';
import { SaveSubLabDto } from './dto/save-sub-lab.dto';
import { SubLabsService } from './sub-labs.service';
import { OrderResultStatus } from '../orders/dto/create-order-response.dto';
import { StatisticsQueryDto } from '../dashboard/dto/statistics-query.dto';
import { DashboardService } from '../dashboard/dashboard.service';
interface RequestWithUser {
    user: {
        userId?: string | null;
        username: string;
        labId: string;
        role?: string;
        subLabId?: string | null;
    };
}
export declare class SubLabsController {
    private readonly subLabsService;
    private readonly dashboardService;
    constructor(subLabsService: SubLabsService, dashboardService: DashboardService);
    listSubLabs(req: RequestWithUser): Promise<{
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        username: string | null;
        priceCount: number;
    }[]>;
    listSubLabOptions(req: RequestWithUser): Promise<import("../entities/sub-lab.entity").SubLab[]>;
    getSubLab(req: RequestWithUser, id: string): Promise<{
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
    createSubLab(req: RequestWithUser, dto: SaveSubLabDto): Promise<{
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
    updateSubLab(req: RequestWithUser, id: string, dto: SaveSubLabDto): Promise<{
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
    archiveSubLab(req: RequestWithUser, id: string): Promise<{
        success: boolean;
    }>;
    getPortalProfile(req: RequestWithUser): Promise<{
        id: string;
        name: string;
        labId: string;
    }>;
    listPortalOrders(req: RequestWithUser, page?: string, size?: string, search?: string, status?: string, patientId?: string, shiftId?: string, startDate?: string, endDate?: string, dateFilterTimeZone?: string, resultStatus?: OrderResultStatus): Promise<{
        items: import("../orders/orders.service").OrderHistoryItem[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    getPortalOrderDetail(req: RequestWithUser, id: string): Promise<import("../entities/order.entity").Order>;
    downloadPortalOrderResults(req: RequestWithUser, id: string, res: Response): Promise<Response<any, Record<string, any>>>;
    getPortalStatistics(req: RequestWithUser, query: StatisticsQueryDto): Promise<import("../dashboard/dashboard.service").StatisticsDto>;
    private resolveRange;
}
export {};
