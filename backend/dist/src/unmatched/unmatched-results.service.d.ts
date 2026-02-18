import { Repository } from 'typeorm';
import { UnmatchedInstrumentResult, UnmatchedReason } from '../entities/unmatched-instrument-result.entity';
import { OrderTest } from '../entities/order-test.entity';
import { PanelStatusService } from '../panels/panel-status.service';
import { AuditService } from '../audit/audit.service';
export interface UnmatchedResultDto {
    id: string;
    instrumentId: string;
    instrumentCode: string;
    instrumentTestName: string | null;
    sampleIdentifier: string;
    resultValue: number | null;
    resultText: string | null;
    unit: string | null;
    flag: string | null;
    referenceRange: string | null;
    reason: UnmatchedReason;
    details: string | null;
    receivedAt: Date;
    status: string;
    createdAt: Date;
}
export interface ResolveUnmatchedDto {
    action: 'ATTACH' | 'DISCARD';
    orderTestId?: string;
    notes?: string;
}
export declare class UnmatchedResultsService {
    private readonly unmatchedRepo;
    private readonly orderTestRepo;
    private readonly panelStatusService;
    private readonly auditService;
    constructor(unmatchedRepo: Repository<UnmatchedInstrumentResult>, orderTestRepo: Repository<OrderTest>, panelStatusService: PanelStatusService, auditService: AuditService);
    findAll(labId: string, params: {
        status?: 'PENDING' | 'RESOLVED' | 'DISCARDED';
        instrumentId?: string;
        reason?: UnmatchedReason;
        page?: number;
        size?: number;
    }): Promise<{
        items: UnmatchedInstrumentResult[];
        total: number;
    }>;
    findOne(id: string, labId: string): Promise<UnmatchedInstrumentResult>;
    resolve(id: string, labId: string, userId: string, dto: ResolveUnmatchedDto): Promise<UnmatchedInstrumentResult>;
    getStats(labId: string): Promise<{
        pending: number;
        resolved: number;
        discarded: number;
        byReason: Record<UnmatchedReason, number>;
    }>;
    getCountByInstrumentInPeriod(labId: string, startDate: Date, endDate: Date): Promise<{
        instrumentId: string;
        instrumentName: string;
        count: number;
    }[]>;
}
