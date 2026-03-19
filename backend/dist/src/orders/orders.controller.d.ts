import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderPaymentDto } from './dto/update-payment.dto';
import { UpdateOrderTestsDto } from './dto/update-order-tests.dto';
import { UpdateOrderDiscountDto } from './dto/update-order-discount.dto';
import { UpdateOrderDeliveryMethodsDto } from './dto/update-order-delivery-methods.dto';
import { UpdateOrderNotesDto } from './dto/update-order-notes.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderView, OrderDetailView, OrderResultStatus } from './dto/create-order-response.dto';
interface RequestWithUser {
    user: {
        userId?: string | null;
        platformUserId?: string | null;
        isImpersonation?: boolean;
        username: string;
        labId: string;
        role?: string;
        subLabId?: string | null;
    };
}
export declare class OrdersController {
    private readonly ordersService;
    private readonly logger;
    constructor(ordersService: OrdersService);
    create(req: RequestWithUser, dto: CreateOrderDto, view?: CreateOrderView): Promise<import("../entities/order.entity").Order | import("./dto/create-order-response.dto").CreateOrderSummaryDto>;
    findAll(req: RequestWithUser, page?: string, size?: string, search?: string, status?: string, patientId?: string, shiftId?: string, sourceSubLabId?: string, departmentId?: string, startDate?: string, endDate?: string, dateFilterTimeZone?: string): Promise<{
        items: import("../entities/order.entity").Order[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    estimatePrice(req: RequestWithUser, testIds?: string, shiftId?: string, sourceSubLabId?: string): Promise<{
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
    findHistory(req: RequestWithUser, page?: string, size?: string, search?: string, status?: string, patientId?: string, shiftId?: string, sourceSubLabId?: string, departmentId?: string, startDate?: string, endDate?: string, dateFilterTimeZone?: string, resultStatus?: OrderResultStatus): Promise<{
        items: import("./orders.service").OrderHistoryItem[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    findOne(req: RequestWithUser, id: string, view?: OrderDetailView): Promise<import("../entities/order.entity").Order>;
    updatePayment(req: RequestWithUser, id: string, dto: UpdateOrderPaymentDto): Promise<import("../entities/order.entity").Order>;
    updateDiscount(req: RequestWithUser, id: string, dto: UpdateOrderDiscountDto): Promise<import("../entities/order.entity").Order>;
    updateOrderNotes(req: RequestWithUser, id: string, dto: UpdateOrderNotesDto): Promise<import("../entities/order.entity").Order>;
    updateOrderTests(req: RequestWithUser, id: string, dto: UpdateOrderTestsDto): Promise<import("../entities/order.entity").Order>;
    updateOrderDeliveryMethods(req: RequestWithUser, id: string, dto: UpdateOrderDeliveryMethodsDto): Promise<import("../entities/order.entity").Order>;
    cancelOrder(req: RequestWithUser, id: string, dto: CancelOrderDto): Promise<import("../entities/order.entity").Order>;
}
export {};
