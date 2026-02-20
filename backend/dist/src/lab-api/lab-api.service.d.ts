import { AuditService } from '../audit/audit.service';
import { RlsSessionService } from '../database/rls-session.service';
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Patient } from '../entities/patient.entity';
import { CreateLabOrderDto } from './dto/create-lab-order.dto';
import { EnterResultDto } from './dto/enter-result.dto';
import { UpsertPatientDto } from './dto/upsert-patient.dto';
export declare class LabApiService {
    private readonly rlsSessionService;
    private readonly auditService;
    constructor(rlsSessionService: RlsSessionService, auditService: AuditService);
    searchPatients(labId: string, params: {
        q?: string;
        page?: number;
        size?: number;
    }): Promise<{
        items: Patient[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    upsertPatient(labId: string, dto: UpsertPatientDto, userId?: string | null): Promise<{
        patient: Patient;
        reused: boolean;
    }>;
    createOrder(labId: string, dto: CreateLabOrderDto, userId?: string | null): Promise<Order>;
    listOrders(labId: string, params: {
        page?: number;
        size?: number;
        status?: OrderStatus;
    }): Promise<{
        items: Order[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    enterResult(labId: string, dto: EnterResultDto, userId?: string | null): Promise<OrderTest>;
    exportOrderResultStub(labId: string, orderId: string, userId?: string | null): Promise<{
        status: string;
        message: string;
        orderId: string;
    }>;
    private findExistingPatient;
    private generatePatientNumber;
    private generateOrderNumber;
    private toResultFlag;
    private updateOrderStatusAfterResult;
    private getPatientLookupKeys;
}
