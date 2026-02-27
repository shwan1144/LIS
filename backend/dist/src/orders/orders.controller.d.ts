import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderPaymentDto } from './dto/update-payment.dto';
import { UpdateOrderTestsDto } from './dto/update-order-tests.dto';
import { UpdateOrderDiscountDto } from './dto/update-order-discount.dto';
interface RequestWithUser {
    user: {
        userId: string;
        username: string;
        labId: string;
    };
}
export declare class OrdersController {
    private readonly ordersService;
    constructor(ordersService: OrdersService);
    create(req: RequestWithUser, dto: CreateOrderDto): Promise<import("../entities/order.entity").Order>;
    findAll(req: RequestWithUser, page?: string, size?: string, search?: string, status?: string, patientId?: string, startDate?: string, endDate?: string): Promise<{
        items: import("../entities/order.entity").Order[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    estimatePrice(req: RequestWithUser, testIds?: string, shiftId?: string): Promise<{
        subtotal: number;
    }>;
    getTodayPatients(req: RequestWithUser): Promise<{
        patient: import("../entities/patient.entity").Patient;
        orderCount: number;
        lastOrderAt: Date | null;
    }[]>;
    getNextOrderNumber(req: RequestWithUser, shiftId?: string): Promise<{
        orderNumber: string;
    }>;
    getWorklist(req: RequestWithUser, shiftId?: string): Promise<import("./orders.service").WorklistItemResponse[]>;
    saveWorklist(req: RequestWithUser, body: {
        shiftId?: string;
        items: {
            rowId: string;
            patientId: string;
            orderId?: string;
        }[];
    }): Promise<{
        ok: boolean;
    }>;
    findHistory(req: RequestWithUser, page?: string, size?: string, search?: string, status?: string, patientId?: string, startDate?: string, endDate?: string): Promise<{
        items: import("./orders.service").OrderHistoryItem[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    findOne(req: RequestWithUser, id: string): Promise<import("../entities/order.entity").Order>;
    updatePayment(req: RequestWithUser, id: string, dto: UpdateOrderPaymentDto): Promise<import("../entities/order.entity").Order>;
    updateDiscount(req: RequestWithUser, id: string, dto: UpdateOrderDiscountDto): Promise<import("../entities/order.entity").Order>;
    updateOrderTests(req: RequestWithUser, id: string, dto: UpdateOrderTestsDto): Promise<import("../entities/order.entity").Order>;
}
export {};
