import { Repository } from 'typeorm';
import { Patient } from '../entities/patient.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Order } from '../entities/order.entity';
import { Lab } from '../entities/lab.entity';
import { PlatformSetting } from '../entities/platform-setting.entity';
import { Shift } from '../entities/shift.entity';
import { Department } from '../entities/department.entity';
import { SubLab } from '../entities/sub-lab.entity';
import { OrdersService } from '../orders/orders.service';
import { UnmatchedResultsService } from '../unmatched/unmatched-results.service';
export interface DashboardKpis {
    ordersToday: number;
    pendingVerification: number;
    avgTatHours: number | null;
    totalPatients: number;
}
export interface DashboardAnnouncementDto {
    text: string | null;
    source: 'LAB' | 'GLOBAL' | 'NONE';
}
export interface OrdersTrendPoint {
    date: string;
    count: number;
}
export interface StatisticsDto {
    orders: {
        total: number;
        byStatus: Record<string, number>;
        byShift: {
            shiftId: string | null;
            shiftName: string;
            count: number;
        }[];
    };
    profit: number;
    revenue: number;
    departmentTestTotal: number;
    tests: {
        total: number;
        byDepartment: {
            departmentId: string | null;
            departmentName: string;
            count: number;
        }[];
        byTest: {
            testId: string;
            testCode: string;
            testName: string;
            count: number;
        }[];
        byShift: {
            shiftId: string | null;
            shiftName: string;
            count: number;
        }[];
    };
    tat: {
        medianMinutes: number | null;
        p95Minutes: number | null;
        withinTargetCount: number;
        withinTargetTotal: number;
        targetMinutes: number;
    };
    quality: {
        abnormalCount: number;
        totalVerified: number;
    };
    subLabBilling: {
        activeSourceType: StatisticsSourceType;
        billableRootTests: number;
        billableAmount: number;
        completedRootTests: number;
        verifiedRootTests: number;
        inHouse: StatisticsBillingSummary;
        bySubLab: {
            subLabId: string;
            subLabName: string;
            billableRootTests: number;
            billableAmount: number;
            completedRootTests: number;
            verifiedRootTests: number;
        }[];
        byTest: {
            testId: string;
            testCode: string;
            testName: string;
            count: number;
            amount: number;
        }[];
    };
    unmatched: {
        pending: number;
        resolved: number;
        discarded: number;
        byReason: Record<string, number>;
    };
    instrumentWorkload: {
        instrumentId: string;
        instrumentName: string;
        count: number;
    }[];
}
export type StatisticsSourceType = 'ALL' | 'IN_HOUSE' | 'SUB_LAB';
export interface StatisticsBillingSummary {
    billableRootTests: number;
    billableAmount: number;
    completedRootTests: number;
    verifiedRootTests: number;
}
export interface StatisticsFilterOptions {
    shiftId?: string | null;
    departmentId?: string | null;
    sourceType?: StatisticsSourceType | null;
    subLabId?: string | null;
}
export declare class DashboardService {
    private readonly patientRepo;
    private readonly orderTestRepo;
    private readonly orderRepo;
    private readonly labRepo;
    private readonly platformSettingRepo;
    private readonly shiftRepo;
    private readonly departmentRepo;
    private readonly subLabRepo;
    private readonly ordersService;
    private readonly unmatchedService;
    constructor(patientRepo: Repository<Patient>, orderTestRepo: Repository<OrderTest>, orderRepo: Repository<Order>, labRepo: Repository<Lab>, platformSettingRepo: Repository<PlatformSetting>, shiftRepo: Repository<Shift>, departmentRepo: Repository<Department>, subLabRepo: Repository<SubLab>, ordersService: OrdersService, unmatchedService: UnmatchedResultsService);
    getKpis(labId: string): Promise<DashboardKpis>;
    private getTotalPatientsCount;
    getLabTimeZone(labId: string): Promise<string>;
    getAnnouncement(labId: string): Promise<DashboardAnnouncementDto>;
    getOrdersTrend(labId: string, days: number): Promise<OrdersTrendPoint[]>;
    getStatistics(labId: string, startDate: Date, endDate: Date, filters?: StatisticsFilterOptions): Promise<StatisticsDto>;
    generateStatisticsPdf(labId: string, startDate: Date, endDate: Date, filters?: StatisticsFilterOptions): Promise<Buffer>;
    private drawTable;
    private ensurePdfSpace;
    private formatCurrency;
    private formatDateLabel;
    private normalizeFilters;
    private buildFilteredRootTestsQuery;
    private buildFilteredOrdersQuery;
    private getOrderStatsForPeriod;
    private getTestsStatsForPeriod;
    private getTatForPeriod;
    private getRecentAverageTatHours;
    private getQualityForPeriod;
    private normalizeAnnouncementText;
    private getSubLabBillingForPeriod;
    private buildFilteredBillableRootTestsQuery;
    private getBillingSummaryForQuery;
    private getBillingStatusCountMap;
    private applySourceTypeFilter;
    private applySpecificSubLabFilter;
    private getSourceTypeLabel;
}
