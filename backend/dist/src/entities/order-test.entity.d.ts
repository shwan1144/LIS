import { Sample } from './sample.entity';
import { Test } from './test.entity';
import { Lab } from './lab.entity';
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
    CRITICAL_LOW = "LL",
    POSITIVE = "POS",
    NEGATIVE = "NEG",
    ABNORMAL = "ABN"
}
export declare class OrderTest {
    id: string;
    labId: string | null;
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
    lab: Lab | null;
    test: Test;
    parentOrderTest: OrderTest | null;
    childOrderTests: OrderTest[];
}
