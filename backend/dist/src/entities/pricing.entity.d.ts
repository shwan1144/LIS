import { Lab } from './lab.entity';
import { Shift } from './shift.entity';
import { Test } from './test.entity';
import { PatientType } from './order.entity';
export declare class Pricing {
    id: string;
    labId: string;
    testId: string;
    shiftId: string | null;
    patientType: PatientType | null;
    price: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    lab: Lab;
    test: Test;
    shift: Shift | null;
}
