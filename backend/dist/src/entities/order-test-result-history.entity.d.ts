import { OrderTest } from './order-test.entity';
import { ResultFlag } from './order-test.entity';
export declare class OrderTestResultHistory {
    id: string;
    orderTestId: string;
    resultValue: number | null;
    resultText: string | null;
    unit: string | null;
    flag: ResultFlag | null;
    referenceRange: string | null;
    receivedAt: Date;
    messageId: string | null;
    obxSetId: string | null;
    obxSequence: number | null;
    instrumentCode: string | null;
    comments: string | null;
    createdAt: Date;
    orderTest: OrderTest;
}
