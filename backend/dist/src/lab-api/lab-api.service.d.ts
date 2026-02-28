import { AuditService } from '../audit/audit.service';
import { RlsSessionService } from '../database/rls-session.service';
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Patient } from '../entities/patient.entity';
import { LabActorContext } from '../types/lab-actor-context';
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
    upsertPatient(labId: string, dto: UpsertPatientDto, actor?: LabActorContext): Promise<{
        patient: Patient;
        reused: boolean;
    }>;
    createOrder(labId: string, dto: CreateLabOrderDto, actor?: LabActorContext): Promise<Order>;
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
    enterResult(labId: string, dto: EnterResultDto, actor?: LabActorContext): Promise<OrderTest>;
    exportOrderResultStub(labId: string, orderId: string, actor?: LabActorContext): Promise<{
        status: string;
        message: string;
        orderId: string;
    }>;
    private findExistingPatient;
    private generatePatientNumber;
    private generateOrderNumber;
    private getLabTimeZone;
    private getMaxOrderSequenceForDate;
    private toResultFlag;
    private updateOrderStatusAfterResult;
    private getPatientLookupKeys;
}
