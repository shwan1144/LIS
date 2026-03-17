import { DeliveryMethod, OrderStatus } from '../../entities/order.entity';
import { Patient } from '../../entities/patient.entity';
export declare enum CreateOrderView {
    SUMMARY = "summary",
    FULL = "full"
}
export declare enum OrderDetailView {
    COMPACT = "compact",
    FULL = "full"
}
export declare enum OrderResultStatus {
    PENDING = "PENDING",
    COMPLETED = "COMPLETED",
    VERIFIED = "VERIFIED",
    REJECTED = "REJECTED"
}
export interface CreateOrderSummaryDto {
    id: string;
    orderNumber: string | null;
    status: OrderStatus;
    registeredAt: Date;
    deliveryMethods: DeliveryMethod[];
    paymentStatus: 'unpaid' | 'partial' | 'paid';
    paidAmount: number | null;
    totalAmount: number;
    discountPercent: number;
    finalAmount: number;
    patient: Patient;
    shift: {
        id: string;
        code: string;
        name: string | null;
    } | null;
    sourceSubLab: {
        id: string;
        name: string;
    } | null;
    testsCount: number;
    readyTestsCount: number;
    reportReady: boolean;
}
