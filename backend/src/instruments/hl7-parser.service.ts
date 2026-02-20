import { Injectable } from '@nestjs/common';

/**
 * HL7 v2.x Message Parser
 * Parses standard HL7 messages used in laboratory information systems
 * 
 * Common message types:
 * - ORU (Observation Result) - Results from instruments
 * - ORM (Order Message) - Orders to instruments
 * - ACK (Acknowledgment) - Message acknowledgments
 * - QRY (Query) - Query messages
 */

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

@Injectable()
export class HL7ParserService {
  private readonly FIELD_SEPARATOR = '|';
  private readonly COMPONENT_SEPARATOR = '^';
  private readonly SUBCOMPONENT_SEPARATOR = '&';
  private readonly REPETITION_SEPARATOR = '~';
  private readonly ESCAPE_CHARACTER = '\\';

  /**
   * Parse raw HL7 message into structured format
   */
  parseMessage(rawMessage: string): HL7Message {
    // Remove MLLP framing characters if present
    const cleanMessage = this.removeMLLPFraming(rawMessage);
    
    // Split into segments
    const segmentStrings = cleanMessage.split(/\r\n|\r|\n/).filter(s => s.trim());
    
    if (segmentStrings.length === 0) {
      throw new Error('Empty HL7 message');
    }

    // Parse MSH segment first to get delimiters
    const mshSegment = segmentStrings[0];
    if (!mshSegment.startsWith('MSH')) {
      throw new Error('Invalid HL7 message: must start with MSH segment');
    }

    const segments: HL7Segment[] = segmentStrings.map(segStr => this.parseSegment(segStr));

    // Extract header information
    const msh = segments.find(s => s.name === 'MSH');
    if (!msh) {
      throw new Error('MSH segment not found');
    }

    return {
      raw: rawMessage,
      segments,
      messageType: this.getField(msh, 9, 0) || '',
      messageControlId: this.getField(msh, 10) || '',
      sendingApplication: this.getField(msh, 3) || '',
      sendingFacility: this.getField(msh, 4) || '',
      receivingApplication: this.getField(msh, 5) || '',
      receivingFacility: this.getField(msh, 6) || '',
      dateTime: this.getField(msh, 7) || '',
      version: this.getField(msh, 12) || '',
    };
  }

  /**
   * Parse ORU (Observation Result) message
   */
  parseORU(rawMessage: string): ParsedORU {
    const message = this.parseMessage(rawMessage);
    
    if (!message.messageType.startsWith('ORU')) {
      throw new Error(`Expected ORU message, got ${message.messageType}`);
    }

    const results: HL7Result[] = [];
    let currentPatientId = '';
    let currentPatientName = '';
    let currentSampleId = '';

    for (let i = 0; i < message.segments.length; i++) {
      const segment = message.segments[i];

      // PID - Patient Identification
      if (segment.name === 'PID') {
        currentPatientId = this.getField(segment, 3) || '';
        const nameField = this.getField(segment, 5) || '';
        const nameParts = nameField.split(this.COMPONENT_SEPARATOR);
        currentPatientName = nameParts.length >= 2 
          ? `${nameParts[1]} ${nameParts[0]}`.trim()
          : nameField;
      }

      // OBR - Observation Request (contains sample info)
      if (segment.name === 'OBR') {
        currentSampleId = this.getField(segment, 3) || this.getField(segment, 2) || '';
      }

      // OBX - Observation Result
      if (segment.name === 'OBX') {
        const result = this.parseOBXSegment(segment, {
          patientId: currentPatientId,
          patientName: currentPatientName,
          sampleId: currentSampleId,
        });
        
        // Collect NTE (Notes) segments that follow
        const comments: string[] = [];
        for (let j = i + 1; j < message.segments.length; j++) {
          if (message.segments[j].name === 'NTE') {
            const comment = this.getField(message.segments[j], 3) || '';
            if (comment) comments.push(comment);
          } else if (message.segments[j].name !== 'NTE') {
            break;
          }
        }
        result.comments = comments;
        
        results.push(result);
      }
    }

    return { message, results };
  }

  /**
   * Parse OBX (Observation) segment
   */
  private parseOBXSegment(
    segment: HL7Segment,
    context: { patientId: string; patientName: string; sampleId: string },
  ): HL7Result {
    const testIdentifier = this.getField(segment, 3) || '';
    const testParts = testIdentifier.split(this.COMPONENT_SEPARATOR);

    return {
      sampleId: context.sampleId,
      patientId: context.patientId,
      patientName: context.patientName,
      testCode: testParts[0] || '',
      testName: testParts[1] || '',
      value: this.getField(segment, 5) || '',
      unit: this.getField(segment, 6) || '',
      referenceRange: this.getField(segment, 7) || '',
      flag: this.getField(segment, 8) || '', // H, L, HH, LL, N, A, etc.
      status: this.getField(segment, 11) || '', // F=Final, P=Preliminary, C=Corrected
      observationDateTime: this.getField(segment, 14) || '',
      performingLab: this.getField(segment, 15) || '',
      comments: [],
    };
  }

  /**
   * Generate ACK (Acknowledgment) message
   */
  generateACK(
    originalMessage: HL7Message,
    ackCode: 'AA' | 'AE' | 'AR', // Accept, Error, Reject
    errorMessage?: string,
  ): string {
    const now = new Date();
    const timestamp = this.formatHL7DateTime(now);
    const messageControlId = `ACK${now.getTime()}`;

    const segments: string[] = [
      // MSH segment
      [
        'MSH',
        '^~\\&',
        originalMessage.receivingApplication,
        originalMessage.receivingFacility,
        originalMessage.sendingApplication,
        originalMessage.sendingFacility,
        timestamp,
        '',
        'ACK^' + originalMessage.messageType.split('^')[0],
        messageControlId,
        'P', // Processing ID
        '2.5', // Version
      ].join(this.FIELD_SEPARATOR),
      
      // MSA segment (Message Acknowledgment)
      [
        'MSA',
        ackCode,
        originalMessage.messageControlId,
        errorMessage || '',
      ].join(this.FIELD_SEPARATOR),
    ];

    // Add ERR segment if there's an error
    if (ackCode !== 'AA' && errorMessage) {
      segments.push(
        [
          'ERR',
          '',
          '',
          '',
          errorMessage,
        ].join(this.FIELD_SEPARATOR),
      );
    }

    return segments.join('\r');
  }

  /**
   * Generate ORM (Order Message) for sending orders to instruments
   */
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
    sampleId: string;
    orderId: string;
    tests: { code: string; name: string }[];
    priority?: string;
    orderDateTime?: string;
  }): string {
    const now = new Date();
    const timestamp = this.formatHL7DateTime(now);

    const segments: string[] = [
      // MSH segment
      [
        'MSH',
        '^~\\&',
        orderData.sendingApplication,
        orderData.sendingFacility,
        orderData.receivingApplication,
        orderData.receivingFacility,
        timestamp,
        '',
        'ORM^O01',
        orderData.messageControlId,
        'P',
        '2.5',
      ].join(this.FIELD_SEPARATOR),

      // PID segment (Patient Identification)
      [
        'PID',
        '1',
        '',
        orderData.patientId,
        '',
        orderData.patientName.split(' ').reverse().join('^'),
        '',
        orderData.patientDob || '',
        orderData.patientSex || '',
      ].join(this.FIELD_SEPARATOR),

      // PV1 segment (Patient Visit) - minimal
      [
        'PV1',
        '1',
        'O', // Outpatient
      ].join(this.FIELD_SEPARATOR),
    ];

    // ORC and OBR for each test
    orderData.tests.forEach((test, index) => {
      // ORC segment (Common Order)
      segments.push(
        [
          'ORC',
          'NW', // New order
          orderData.orderId,
          '',
          '',
          '',
          '',
          '',
          orderData.orderDateTime || timestamp,
        ].join(this.FIELD_SEPARATOR),
      );

      // OBR segment (Observation Request)
      segments.push(
        [
          'OBR',
          (index + 1).toString(),
          orderData.orderId,
          orderData.sampleId,
          `${test.code}^${test.name}`,
          orderData.priority || 'R', // R=Routine, S=Stat
          orderData.orderDateTime || timestamp,
        ].join(this.FIELD_SEPARATOR),
      );
    });

    return segments.join('\r');
  }

  /**
   * Parse a single HL7 segment
   */
  private parseSegment(segmentString: string): HL7Segment {
    const fields = segmentString.split(this.FIELD_SEPARATOR);
    const name = fields[0];

    // MSH segment is special - field separator is at position 1
    if (name === 'MSH') {
      return {
        name,
        fields: ['MSH', this.FIELD_SEPARATOR, ...fields.slice(1)],
        raw: segmentString,
      };
    }

    return {
      name,
      fields,
      raw: segmentString,
    };
  }

  /**
   * Get field value from segment
   * @param segment The parsed segment
   * @param fieldIndex 1-based field index (as per HL7 spec)
   * @param componentIndex 0-based component index (optional)
   */
  getField(segment: HL7Segment, fieldIndex: number, componentIndex?: number): string | undefined {
    const field = segment.fields[fieldIndex];
    if (field === undefined) return undefined;

    if (componentIndex !== undefined) {
      const components = field.split(this.COMPONENT_SEPARATOR);
      return components[componentIndex];
    }

    return field;
  }

  /**
   * Format date for HL7 (YYYYMMDDHHMMSS)
   */
  private formatHL7DateTime(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return (
      date.getFullYear().toString() +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds())
    );
  }

  /**
   * Parse HL7 datetime string to Date
   */
  parseHL7DateTime(hl7DateTime: string): Date | null {
    if (!hl7DateTime || hl7DateTime.length < 8) return null;

    const year = parseInt(hl7DateTime.substring(0, 4), 10);
    const month = parseInt(hl7DateTime.substring(4, 6), 10) - 1;
    const day = parseInt(hl7DateTime.substring(6, 8), 10);
    const hour = hl7DateTime.length >= 10 ? parseInt(hl7DateTime.substring(8, 10), 10) : 0;
    const minute = hl7DateTime.length >= 12 ? parseInt(hl7DateTime.substring(10, 12), 10) : 0;
    const second = hl7DateTime.length >= 14 ? parseInt(hl7DateTime.substring(12, 14), 10) : 0;

    return new Date(year, month, day, hour, minute, second);
  }

  /**
   * Remove MLLP (Minimal Lower Layer Protocol) framing
   * Start: VT (0x0B), End: FS + CR (0x1C 0x0D)
   */
  private removeMLLPFraming(message: string): string {
    let result = message;
    
    // Remove start block (VT = 0x0B)
    if (result.charCodeAt(0) === 0x0b) {
      result = result.substring(1);
    }
    
    // Remove end block (FS = 0x1C, CR = 0x0D)
    if (result.charCodeAt(result.length - 1) === 0x0d) {
      result = result.substring(0, result.length - 1);
    }
    if (result.charCodeAt(result.length - 1) === 0x1c) {
      result = result.substring(0, result.length - 1);
    }

    return result.trim();
  }

  /**
   * Add MLLP framing to message
   */
  addMLLPFraming(message: string): string {
    const VT = String.fromCharCode(0x0b);
    const FS = String.fromCharCode(0x1c);
    const CR = String.fromCharCode(0x0d);
    return VT + message + FS + CR;
  }

  /**
   * Map HL7 abnormal flag to LIS flag
   */
  mapFlag(hl7Flag: string): 'N' | 'H' | 'L' | 'HH' | 'LL' | 'POS' | 'NEG' | 'ABN' | null {
    const flag = hl7Flag?.toUpperCase();
    switch (flag) {
      case 'N':
        return 'N'; // Normal
      case 'H':
        return 'H'; // High
      case 'L':
        return 'L'; // Low
      case 'HH':
      case 'PH': // Panic High
      case '>':
        return 'HH'; // Critical High
      case 'LL':
      case 'PL': // Panic Low
      case '<':
        return 'LL'; // Critical Low
      case 'POS':
      case 'POSITIVE':
      case 'REACTIVE':
        return 'POS';
      case 'NEG':
      case 'NEGATIVE':
      case 'NONREACTIVE':
      case 'NON-REACTIVE':
        return 'NEG';
      case 'A':
      case 'AA':
      case 'ABN':
        return 'ABN'; // Abnormal (non directional)
      default:
        return null;
    }
  }
}
