import { Repository } from 'typeorm';
import { Instrument, InstrumentTestMapping } from '../entities/instrument.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Order } from '../entities/order.entity';
import { HL7ParserService, HL7Result } from './hl7-parser.service';
import { AuditService } from '../audit/audit.service';
export interface ProcessedResult {
    success: boolean;
    orderTestId?: string;
    orderId?: string;
    message: string;
}
export declare class InstrumentResultProcessor {
    private readonly mappingRepo;
    private readonly orderTestRepo;
    private readonly orderRepo;
    private readonly hl7Parser;
    private readonly auditService;
    private readonly logger;
    constructor(mappingRepo: Repository<InstrumentTestMapping>, orderTestRepo: Repository<OrderTest>, orderRepo: Repository<Order>, hl7Parser: HL7ParserService, auditService: AuditService);
    processResult(instrument: Instrument, result: HL7Result): Promise<ProcessedResult>;
    private findSample;
    private parseResultValue;
    processBatch(instrument: Instrument, results: HL7Result[]): Promise<{
        processed: number;
        failed: number;
        errors: string[];
    }>;
}
