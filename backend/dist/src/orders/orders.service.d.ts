import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../entities/order.entity';
import { Patient } from '../entities/patient.entity';
import { Lab } from '../entities/lab.entity';
import { Shift } from '../entities/shift.entity';
import { Test } from '../entities/test.entity';
import { Pricing } from '../entities/pricing.entity';
import { TestComponent } from '../entities/test-component.entity';
import { LabOrdersWorklist } from '../entities/lab-orders-worklist.entity';
import { CreateOrderDto } from './dto/create-order.dto';
export interface WorklistItemStored {
    rowId: string;
    patientId: string;
    orderId?: string;
}
export interface WorklistItemResponse {
    rowId: string;
    patient: Patient;
    createdOrder: Order | null;
}
export declare class OrdersService {
    private readonly orderRepo;
    private readonly patientRepo;
    private readonly labRepo;
    private readonly shiftRepo;
    private readonly testRepo;
    private readonly pricingRepo;
    private readonly testComponentRepo;
    private readonly worklistRepo;
    constructor(orderRepo: Repository<Order>, patientRepo: Repository<Patient>, labRepo: Repository<Lab>, shiftRepo: Repository<Shift>, testRepo: Repository<Test>, pricingRepo: Repository<Pricing>, testComponentRepo: Repository<TestComponent>, worklistRepo: Repository<LabOrdersWorklist>);
    create(labId: string, dto: CreateOrderDto): Promise<Order>;
    findAll(labId: string, params: {
        page?: number;
        size?: number;
        search?: string;
        status?: OrderStatus;
        patientId?: string;
        startDate?: string;
        endDate?: string;
    }): Promise<{
        items: Order[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    findOne(id: string, labId: string): Promise<Order>;
    updatePayment(id: string, labId: string, data: {
        paymentStatus: 'unpaid' | 'partial' | 'paid';
        paidAmount?: number;
    }): Promise<Order>;
    private findPricing;
    getNextOrderNumber(labId: string, shiftId: string | null): Promise<string>;
    private generateOrderNumber;
    private computeNextOrderNumber;
    private getNextSequenceForScope;
    estimatePrice(labId: string, testIds: string[], shiftId?: string | null): Promise<{
        subtotal: number;
    }>;
    getOrdersTodayCount(labId: string): Promise<number>;
    getTodayPatients(labId: string): Promise<Array<{
        patient: Patient;
        orderCount: number;
        lastOrderAt: Date | null;
    }>>;
    getOrdersTrend(labId: string, days: number): Promise<{
        date: string;
        count: number;
    }[]>;
    getOrderStatsForPeriod(labId: string, startDate: Date, endDate: Date): Promise<{
        total: number;
        byStatus: Record<string, number>;
        byShift: {
            shiftId: string | null;
            shiftName: string;
            count: number;
        }[];
        revenue: number;
    }>;
    getWorklist(labId: string, shiftId: string | null): Promise<WorklistItemResponse[]>;
    saveWorklist(labId: string, shiftId: string | null, items: WorklistItemStored[]): Promise<void>;
}
