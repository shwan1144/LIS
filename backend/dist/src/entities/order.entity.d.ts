import { Patient } from './patient.entity';
import { Lab } from './lab.entity';
import { Shift } from './shift.entity';
import { Sample } from './sample.entity';
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
export declare class Order {
    id: string;
    patientId: string;
    labId: string;
    shiftId: string | null;
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
    createdAt: Date;
    updatedAt: Date;
    patient: Patient;
    lab: Lab;
    shift: Shift | null;
    samples: Sample[];
}
