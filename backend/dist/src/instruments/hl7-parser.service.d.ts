export interface HL7Segment {
    name: string;
    fields: string[];
    raw: string;
}
export interface HL7Message {
    raw: string;
    segments: HL7Segment[];
    messageType: string;
    messageControlId: string;
    sendingApplication: string;
    sendingFacility: string;
    receivingApplication: string;
    receivingFacility: string;
    dateTime: string;
    version: string;
}
export interface HL7Result {
    sampleId: string;
    patientId: string;
    patientName: string;
    testCode: string;
    testName: string;
    value: string;
    unit: string;
    referenceRange: string;
    flag: string;
    status: string;
    observationDateTime: string;
    performingLab: string;
    comments: string[];
}
export interface ParsedORU {
    message: HL7Message;
    results: HL7Result[];
}
export declare class HL7ParserService {
    private readonly FIELD_SEPARATOR;
    private readonly COMPONENT_SEPARATOR;
    private readonly SUBCOMPONENT_SEPARATOR;
    private readonly REPETITION_SEPARATOR;
    private readonly ESCAPE_CHARACTER;
    parseMessage(rawMessage: string): HL7Message;
    parseORU(rawMessage: string): ParsedORU;
    private parseOBXSegment;
    generateACK(originalMessage: HL7Message, ackCode: 'AA' | 'AE' | 'AR', errorMessage?: string): string;
    generateORM(orderData: {
        messageControlId: string;
        sendingApplication: string;
        sendingFacility: string;
        receivingApplication: string;
        receivingFacility: string;
        patientId: string;
        patientName: string;
        patientDob?: string;
        patientSex?: string;
        orderNumber: string;
        tests: {
            code: string;
            name: string;
        }[];
        priority?: string;
        orderDateTime?: string;
    }): string;
    private parseSegment;
    getField(segment: HL7Segment, fieldIndex: number, componentIndex?: number): string | undefined;
    private formatHL7DateTime;
    parseHL7DateTime(hl7DateTime: string): Date | null;
    private removeMLLPFraming;
    addMLLPFraming(message: string): string;
    mapFlag(hl7Flag: string): 'N' | 'H' | 'L' | 'HH' | 'LL' | 'POS' | 'NEG' | 'ABN' | null;
}
