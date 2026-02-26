import { Repository } from 'typeorm';
import { Instrument, InstrumentMessage, InstrumentTestMapping } from '../entities/instrument.entity';
import { Order } from '../entities/order.entity';
import { OrderTest } from '../entities/order-test.entity';
import { OrderTestResultHistory } from '../entities/order-test-result-history.entity';
import { UnmatchedInstrumentResult } from '../entities/unmatched-instrument-result.entity';
import { AuditService } from '../audit/audit.service';
import { PanelStatusService } from '../panels/panel-status.service';
import { AstmParserService } from './astm-parser.service';
export interface AstmIngestionResult {
    success: boolean;
    messageId: string;
    processed: number;
    unmatched: number;
    errors: string[];
    ackCode: 'AA' | 'AE' | 'AR';
    ackMessage?: string;
}
export declare class AstmIngestionService {
    private readonly instrumentRepo;
    private readonly mappingRepo;
    private readonly messageRepo;
    private readonly orderTestRepo;
    private readonly historyRepo;
    private readonly unmatchedRepo;
    private readonly orderRepo;
    private readonly astmParser;
    private readonly panelStatusService;
    private readonly auditService;
    private readonly logger;
    constructor(instrumentRepo: Repository<Instrument>, mappingRepo: Repository<InstrumentTestMapping>, messageRepo: Repository<InstrumentMessage>, orderTestRepo: Repository<OrderTest>, historyRepo: Repository<OrderTestResultHistory>, unmatchedRepo: Repository<UnmatchedInstrumentResult>, orderRepo: Repository<Order>, astmParser: AstmParserService, panelStatusService: PanelStatusService, auditService: AuditService);
    ingestAstmResult(instrumentId: string, rawMessage: string, config?: {
        strictMode?: boolean;
    }): Promise<AstmIngestionResult>;
    private processResult;
    private storeUnmatched;
    private findSample;
    private parseResultValue;
}
