import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Instrument } from '../entities/instrument.entity';
import { InstrumentMessage } from '../entities/instrument.entity';
import { HL7ParserService } from './hl7-parser.service';
import { InstrumentResultProcessor } from './result-processor.service';
import { HL7IngestionService } from './hl7-ingestion.service';
export declare class TCPListenerService implements OnModuleInit, OnModuleDestroy {
    private readonly instrumentRepo;
    private readonly messageRepo;
    private readonly hl7Parser;
    private readonly resultProcessor;
    private readonly hl7Ingestion;
    private readonly logger;
    private connections;
    constructor(instrumentRepo: Repository<Instrument>, messageRepo: Repository<InstrumentMessage>, hl7Parser: HL7ParserService, resultProcessor: InstrumentResultProcessor, hl7Ingestion: HL7IngestionService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    initializeAllListeners(): Promise<void>;
    startServer(instrument: Instrument): Promise<boolean>;
    connectToInstrument(instrument: Instrument): Promise<boolean>;
    private handleConnection;
    private setupSocketHandlers;
    private extractMessages;
    simulateMessage(instrument: Instrument, rawMessage: string): Promise<{
        success: boolean;
        message?: string;
        messageId?: string;
    }>;
    private processMessage;
    private processMessageInternal;
    private processORU;
    sendMessage(instrument: Instrument, message: string): Promise<boolean>;
    sendOrder(instrumentId: string, orderData: Parameters<HL7ParserService['generateORM']>[0]): Promise<boolean>;
    private updateInstrumentStatus;
    restartListener(instrumentId: string): Promise<boolean>;
    getConnectionStatus(instrumentId: string): {
        connected: boolean;
        hasServer: boolean;
    };
}
