import { InstrumentsService, CreateInstrumentDto, CreateMappingDto, SendInstrumentTestOrderDto } from './instruments.service';
interface RequestWithUser {
    user: {
        userId: string;
        username: string;
        labId: string;
    };
}
export declare class InstrumentsController {
    private readonly instrumentsService;
    constructor(instrumentsService: InstrumentsService);
    findAll(req: RequestWithUser): Promise<import("../entities/instrument.entity").Instrument[]>;
    getMappingsByTest(req: RequestWithUser, testId: string): Promise<(import("../entities/instrument.entity").InstrumentTestMapping & {
        instrument: import("../entities/instrument.entity").Instrument;
    })[]>;
    findOne(req: RequestWithUser, id: string): Promise<import("../entities/instrument.entity").Instrument>;
    create(req: RequestWithUser, dto: CreateInstrumentDto): Promise<import("../entities/instrument.entity").Instrument>;
    update(req: RequestWithUser, id: string, dto: Partial<CreateInstrumentDto>): Promise<import("../entities/instrument.entity").Instrument>;
    delete(req: RequestWithUser, id: string): Promise<void>;
    toggleActive(req: RequestWithUser, id: string): Promise<import("../entities/instrument.entity").Instrument>;
    restartConnection(req: RequestWithUser, id: string): Promise<{
        success: boolean;
    }>;
    sendTestOrder(req: RequestWithUser, id: string, dto: SendInstrumentTestOrderDto): Promise<{
        success: boolean;
        message: string;
    }>;
    getMappings(req: RequestWithUser, id: string): Promise<import("../entities/instrument.entity").InstrumentTestMapping[]>;
    createMapping(req: RequestWithUser, id: string, dto: CreateMappingDto): Promise<import("../entities/instrument.entity").InstrumentTestMapping>;
    updateMapping(req: RequestWithUser, id: string, mappingId: string, dto: Partial<CreateMappingDto>): Promise<import("../entities/instrument.entity").InstrumentTestMapping>;
    deleteMapping(req: RequestWithUser, id: string, mappingId: string): Promise<void>;
    getMessages(req: RequestWithUser, id: string, page?: string, size?: string, direction?: 'IN' | 'OUT'): Promise<{
        items: import("../entities/instrument.entity").InstrumentMessage[];
        total: number;
    }>;
    simulateMessage(req: RequestWithUser, id: string, body: {
        rawMessage: string;
    }): Promise<{
        success: boolean;
        message?: string;
        messageId?: string;
    }>;
}
export {};
