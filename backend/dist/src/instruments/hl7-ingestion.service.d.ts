import { Repository } from 'typeorm';
import { Instrument, InstrumentTestMapping, InstrumentMessage } from '../entities/instrument.entity';
import { OrderTest } from '../entities/order-test.entity';
import { OrderTestResultHistory } from '../entities/order-test-result-history.entity';
import { UnmatchedInstrumentResult } from '../entities/unmatched-instrument-result.entity';
import { Sample } from '../entities/sample.entity';
import { Order } from '../entities/order.entity';
import { HL7ParserService } from './hl7-parser.service';
import { PanelStatusService } from '../panels/panel-status.service';
import { AuditService } from '../audit/audit.service';
export interface IngestionResult {
    success: boolean;
    messageId: string;
    processed: number;
    unmatched: number;
    errors: string[];
    ackCode: 'AA' | 'AE' | 'AR';
    ackMessage?: string;
}
export declare class HL7IngestionService {
    private readonly instrumentRepo;
    private readonly mappingRepo;
    private readonly messageRepo;
    private readonly orderTestRepo;
    private readonly historyRepo;
    private readonly unmatchedRepo;
    private readonly sampleRepo;
    private readonly orderRepo;
    private readonly hl7Parser;
    private readonly panelStatusService;
    private readonly auditService;
    private readonly logger;
    constructor(instrumentRepo: Repository<Instrument>, mappingRepo: Repository<InstrumentTestMapping>, messageRepo: Repository<InstrumentMessage>, orderTestRepo: Repository<OrderTest>, historyRepo: Repository<OrderTestResultHistory>, unmatchedRepo: Repository<UnmatchedInstrumentResult>, sampleRepo: Repository<Sample>, orderRepo: Repository<Order>, hl7Parser: HL7ParserService, panelStatusService: PanelStatusService, auditService: AuditService);
    ingestHL7Oru(instrumentId: string, rawMessage: string, config?: {
        sampleIdentifierField?: 'OBR-3' | 'OBR-2' | 'PID-3';
        strictMode?: boolean;
    }): Promise<IngestionResult>;
    private processOBXResult;
    private storeUnmatched;
    private findSample;
    private parseResultValue;
}
