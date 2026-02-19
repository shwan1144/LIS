import { Lab } from './lab.entity';
export declare enum InstrumentProtocol {
    HL7_V2 = "HL7_V2",
    ASTM = "ASTM",
    POCT1A = "POCT1A",
    CUSTOM = "CUSTOM"
}
export declare enum ConnectionType {
    TCP_SERVER = "TCP_SERVER",
    TCP_CLIENT = "TCP_CLIENT",
    SERIAL = "SERIAL",
    FILE_WATCH = "FILE_WATCH"
}
export declare enum InstrumentStatus {
    OFFLINE = "OFFLINE",
    ONLINE = "ONLINE",
    ERROR = "ERROR",
    CONNECTING = "CONNECTING"
}
export declare class Instrument {
    id: string;
    labId: string;
    code: string;
    name: string;
    manufacturer: string | null;
    model: string | null;
    serialNumber: string | null;
    protocol: InstrumentProtocol;
    connectionType: ConnectionType;
    host: string | null;
    port: number | null;
    serialPort: string | null;
    baudRate: number | null;
    dataBits: string | null;
    parity: string | null;
    stopBits: string | null;
    watchFolder: string | null;
    filePattern: string | null;
    hl7StartBlock: string;
    hl7EndBlock: string;
    sendingApplication: string | null;
    sendingFacility: string | null;
    receivingApplication: string | null;
    receivingFacility: string | null;
    status: InstrumentStatus;
    lastConnectedAt: Date | null;
    lastMessageAt: Date | null;
    lastError: string | null;
    isActive: boolean;
    autoPost: boolean;
    requireVerification: boolean;
    createdAt: Date;
    updatedAt: Date;
    lab: Lab;
    testMappings: InstrumentTestMapping[];
}
export declare class InstrumentTestMapping {
    id: string;
    instrumentId: string;
    testId: string;
    instrumentTestCode: string;
    instrumentTestName: string | null;
    multiplier: number | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    instrument: Instrument;
}
export declare class InstrumentMessage {
    id: string;
    instrumentId: string;
    direction: 'IN' | 'OUT';
    messageType: string;
    messageControlId: string | null;
    rawMessage: string;
    parsedMessage: Record<string, unknown> | null;
    status: 'RECEIVED' | 'PROCESSED' | 'ERROR' | 'SENT' | 'ACKNOWLEDGED';
    errorMessage: string | null;
    orderId: string | null;
    orderTestId: string | null;
    createdAt: Date;
    instrument: Instrument;
}
