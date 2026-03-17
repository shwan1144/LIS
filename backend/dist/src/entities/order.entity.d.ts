import { Patient } from './patient.entity';
import { Lab } from './lab.entity';
import { Shift } from './shift.entity';
import { Sample } from './sample.entity';
import { SubLab } from './sub-lab.entity';
export declare enum OrderStatus {
    REGISTERED = "REGISTERED",
    COLLECTED = "COLLECTED",
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export declare enum PatientType {
    WALK_IN = "WALK_IN",
    HOSPITAL = "HOSPITAL",
    CONTRACT = "CONTRACT"
}
export declare enum DeliveryMethod {
    PRINT = "PRINT",
    WHATSAPP = "WHATSAPP",
    VIBER = "VIBER"
}
export declare class Order {
    id: string;
    patientId: string;
    labId: string;
    shiftId: string | null;
    sourceSubLabId: string | null;
    orderNumber: string | null;
    status: OrderStatus;
    patientType: PatientType;
    notes: string | null;
    totalAmount: number;
    discountPercent: number;
    finalAmount: number;
    paymentStatus: string;
    paidAmount: number | null;
    registeredAt: Date;
    deliveryMethods: DeliveryMethod[];
    reportS3Key: string | null;
    reportGeneratedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    patient: Patient;
    lab: Lab;
    shift: Shift | null;
    sourceSubLab: SubLab | null;
    samples: Sample[];
}
