import { Repository } from 'typeorm';
import { Patient } from '../entities/patient.entity';
import { OrderTest } from '../entities/order-test.entity';
import { OrdersService } from '../orders/orders.service';
import { UnmatchedResultsService } from '../unmatched/unmatched-results.service';
export interface DashboardKpis {
    ordersToday: number;
    pendingVerification: number;
    criticalAlerts: number;
    avgTatHours: number | null;
    totalPatients: number;
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
    revenue: number;
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
        criticalCount: number;
        totalVerified: number;
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
export declare class DashboardService {
    private readonly patientRepo;
    private readonly orderTestRepo;
    private readonly ordersService;
    private readonly unmatchedService;
    constructor(patientRepo: Repository<Patient>, orderTestRepo: Repository<OrderTest>, ordersService: OrdersService, unmatchedService: UnmatchedResultsService);
    getKpis(labId: string): Promise<DashboardKpis>;
    getOrdersTrend(labId: string, days: number): Promise<OrdersTrendPoint[]>;
    getStatistics(labId: string, startDate: Date, endDate: Date): Promise<StatisticsDto>;
    private getTestsStatsForPeriod;
    private getTatForPeriod;
    private getQualityForPeriod;
}
