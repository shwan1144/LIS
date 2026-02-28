export interface AstmRecord {
    type: string;
    fields: string[];
    raw: string;
}
export interface AstmResult {
    sampleId: string;
    testCode: string;
    testName: string | null;
    value: string;
    unit: string;
    referenceRange: string;
    flag: string;
    status: string;
    comments: string[];
    sequence: number;
    rawRecord: string;
}
export interface ParsedAstmMessage {
    records: AstmRecord[];
    results: AstmResult[];
    messageType: string;
    terminationCode: string | null;
    protocolVariant: 'ELECSYS' | 'COBAS' | 'UNKNOWN';
    sender: string | null;
}
export declare class AstmParserService {
    private static readonly CONTROL_CHARS_RE;
    parseMessage(rawMessage: string): ParsedAstmMessage;
    mapFlag(astmFlag: string): 'N' | 'H' | 'L' | 'HH' | 'LL' | 'POS' | 'NEG' | 'ABN' | null;
    isLikelyAstm(rawMessage: string): boolean;
    private normalizeInput;
    private splitRecords;
    private detectMessageType;
    private detectVariant;
    private detectSender;
    private parseSampleId;
    private extractInstrumentTestCode;
    private parseComment;
}
