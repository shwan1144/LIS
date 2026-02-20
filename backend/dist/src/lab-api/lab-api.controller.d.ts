import { OrderStatus } from '../entities/order.entity';
import { CreateLabOrderDto } from './dto/create-lab-order.dto';
import { EnterResultDto } from './dto/enter-result.dto';
import { UpsertPatientDto } from './dto/upsert-patient.dto';
import { LabApiService } from './lab-api.service';
interface RequestWithUser {
    user: {
        userId: string;
        labId: string;
        role: string;
    };
}
export declare class LabApiController {
    private readonly labApiService;
    constructor(labApiService: LabApiService);
    searchPatients(req: RequestWithUser, q?: string, page?: string, size?: string): Promise<{
        items: import("../entities/patient.entity").Patient[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    upsertPatient(req: RequestWithUser, dto: UpsertPatientDto): Promise<{
        patient: import("../entities/patient.entity").Patient;
        reused: boolean;
    }>;
    createOrder(req: RequestWithUser, dto: CreateLabOrderDto): Promise<import("../entities/order.entity").Order>;
    listOrders(req: RequestWithUser, page?: string, size?: string, status?: OrderStatus): Promise<{
        items: import("../entities/order.entity").Order[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    enterResult(req: RequestWithUser, dto: EnterResultDto): Promise<import("../entities/order-test.entity").OrderTest>;
    exportOrder(req: RequestWithUser, id: string): Promise<{
        status: string;
        message: string;
        orderId: string;
    }>;
}
export {};
