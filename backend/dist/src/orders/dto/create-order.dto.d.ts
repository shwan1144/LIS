import { PatientType } from '../../entities/order.entity';
import { TubeType } from '../../entities/sample.entity';
export declare class CreateOrderTestDto {
    testId: string;
}
export declare class CreateSampleDto {
    sampleId?: string;
    tubeType?: TubeType;
    tests: CreateOrderTestDto[];
}
export declare class CreateOrderDto {
    patientId: string;
    shiftId?: string;
    patientType?: PatientType;
    notes?: string;
    discountPercent?: number;
    samples: CreateSampleDto[];
}
