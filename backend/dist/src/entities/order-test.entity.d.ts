import { Sample } from './sample.entity';
import { Test } from './test.entity';
export declare enum OrderTestStatus {
    PENDING = "PENDING",
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETED = "COMPLETED",
    VERIFIED = "VERIFIED",
    REJECTED = "REJECTED"
}
export declare enum ResultFlag {
    NORMAL = "N",
    HIGH = "H",
    LOW = "L",
    CRITICAL_HIGH = "HH",
    CRITICAL_LOW = "LL"
}
export declare class OrderTest {
    id: string;
    sampleId: string;
    testId: string;
    parentOrderTestId: string | null;
    status: OrderTestStatus;
    price: number | null;
    resultValue: number | null;
    resultText: string | null;
    resultParameters: Record<string, string> | null;
    flag: ResultFlag | null;
    resultedAt: Date | null;
    resultedBy: string | null;
    verifiedAt: Date | null;
    verifiedBy: string | null;
    rejectionReason: string | null;
    comments: string | null;
    createdAt: Date;
    updatedAt: Date;
    sample: Sample;
    test: Test;
    parentOrderTest: OrderTest | null;
    childOrderTests: OrderTest[];
}
