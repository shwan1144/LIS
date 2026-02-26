import { Repository } from 'typeorm';
import { Instrument, InstrumentTestMapping, InstrumentMessage, InstrumentProtocol, ConnectionType } from '../entities/instrument.entity';
import { Test } from '../entities/test.entity';
import { TCPListenerService } from './tcp-listener.service';
export interface CreateInstrumentDto {
    code: string;
    name: string;
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    protocol?: InstrumentProtocol;
    connectionType?: ConnectionType;
    host?: string;
    port?: number;
    serialPort?: string;
    baudRate?: number;
    dataBits?: string;
    parity?: string;
    stopBits?: string;
    watchFolder?: string;
    filePattern?: string;
    sendingApplication?: string;
    sendingFacility?: string;
    receivingApplication?: string;
    receivingFacility?: string;
    autoPost?: boolean;
    requireVerification?: boolean;
    bidirectionalEnabled?: boolean;
    isActive?: boolean;
}
export interface CreateMappingDto {
    testId: string;
    instrumentTestCode: string;
    instrumentTestName?: string;
    multiplier?: number;
}
export interface SendInstrumentTestOrderDto {
    orderNumber?: string;
    orderId?: string;
    patientId: string;
    patientName: string;
    patientDob?: string;
    patientSex?: string;
    priority?: string;
    tests: Array<{
        code: string;
        name?: string;
    }>;
}
export declare class InstrumentsService {
    private readonly instrumentRepo;
    private readonly mappingRepo;
    private readonly messageRepo;
    private readonly testRepo;
    private readonly tcpListener;
    constructor(instrumentRepo: Repository<Instrument>, mappingRepo: Repository<InstrumentTestMapping>, messageRepo: Repository<InstrumentMessage>, testRepo: Repository<Test>, tcpListener: TCPListenerService);
    findAll(labId: string): Promise<Instrument[]>;
    findOne(id: string, labId: string): Promise<Instrument>;
    create(labId: string, dto: CreateInstrumentDto): Promise<Instrument>;
    update(id: string, labId: string, dto: Partial<CreateInstrumentDto>): Promise<Instrument>;
    delete(id: string, labId: string): Promise<void>;
    toggleActive(id: string, labId: string): Promise<Instrument>;
    restartConnection(id: string, labId: string): Promise<boolean>;
    sendTestOrder(id: string, labId: string, dto: SendInstrumentTestOrderDto): Promise<{
        success: boolean;
        message: string;
    }>;
    getMappings(instrumentId: string, labId: string): Promise<InstrumentTestMapping[]>;
    getMappingsByTestId(testId: string, labId: string): Promise<(InstrumentTestMapping & {
        instrument: Instrument;
    })[]>;
    createMapping(instrumentId: string, labId: string, dto: CreateMappingDto): Promise<InstrumentTestMapping>;
    updateMapping(instrumentId: string, mappingId: string, labId: string, dto: Partial<CreateMappingDto>): Promise<InstrumentTestMapping>;
    deleteMapping(instrumentId: string, mappingId: string, labId: string): Promise<void>;
    getMessages(instrumentId: string, labId: string, params: {
        page?: number;
        size?: number;
        direction?: 'IN' | 'OUT';
    }): Promise<{
        items: InstrumentMessage[];
        total: number;
    }>;
    simulateMessage(instrumentId: string, labId: string, rawMessage: string): Promise<{
        success: boolean;
        message?: string;
        messageId?: string;
    }>;
}
