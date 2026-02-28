import { Instrument } from './instrument.entity';
import { ResultFlag } from './order-test.entity';
export declare enum UnmatchedReason {
    UNORDERED_TEST = "UNORDERED_TEST",
    UNMATCHED_SAMPLE = "UNMATCHED_SAMPLE",
    NO_MAPPING = "NO_MAPPING",
    INVALID_SAMPLE_STATUS = "INVALID_SAMPLE_STATUS",
    DUPLICATE_RESULT = "DUPLICATE_RESULT"
}
export declare class UnmatchedInstrumentResult {
    id: string;
    instrumentId: string;
    sampleIdentifier: string;
    instrumentCode: string;
    instrumentTestName: string | null;
    resultValue: number | null;
    resultText: string | null;
    unit: string | null;
    flag: ResultFlag | null;
    referenceRange: string | null;
    reason: UnmatchedReason;
    details: string | null;
    rawMessageId: string | null;
    receivedAt: Date;
    status: 'PENDING' | 'RESOLVED' | 'DISCARDED';
    resolvedOrderTestId: string | null;
    resolvedBy: string | null;
    resolvedAt: Date | null;
    resolutionNotes: string | null;
    createdAt: Date;
    updatedAt: Date;
    instrument: Instrument;
}
