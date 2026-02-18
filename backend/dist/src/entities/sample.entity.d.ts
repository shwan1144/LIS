import { Order } from './order.entity';
import { OrderTest } from './order-test.entity';
export declare enum TubeType {
    SERUM = "SERUM",
    PLASMA = "PLASMA",
    WHOLE_BLOOD = "WHOLE_BLOOD",
    URINE = "URINE",
    STOOL = "STOOL",
    SWAB = "SWAB",
    OTHER = "OTHER"
}
export declare class Sample {
    id: string;
    orderId: string;
    sampleId: string | null;
    tubeType: TubeType | null;
    barcode: string | null;
    sequenceNumber: number | null;
    qrCode: string | null;
    collectedAt: Date | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    order: Order;
    orderTests: OrderTest[];
}
