import { Injectable } from '@nestjs/common';

export interface AstmRecord {
  type: string;
  fields: string[];
  raw: string;
}

export interface AstmResult {
  /** Instrument-provided order identifier; expected to contain LIS order number. */
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

@Injectable()
export class AstmParserService {
  private static readonly CONTROL_CHARS_RE = /[\x00-\x08\x0b-\x0c\x0e-\x1a\x1c-\x1f]/g;

  parseMessage(rawMessage: string): ParsedAstmMessage {
    const normalized = this.normalizeInput(rawMessage);
    const records = this.splitRecords(normalized);
    if (!records.length) {
      throw new Error('Empty ASTM message');
    }

    const header = records.find((r) => r.type === 'H');
    const terminator = records.find((r) => r.type === 'L');
    if (!header || !terminator) {
      throw new Error('Invalid ASTM message: expected H and L records');
    }

    const messageType = this.detectMessageType(header);
    const protocolVariant = this.detectVariant(header);
    const sender = this.detectSender(header);
    const terminationCode = terminator.fields[2]?.trim() || null;

    const results: AstmResult[] = [];
    let currentSampleId = '';

    for (const record of records) {
      if (record.type === 'O') {
        currentSampleId = this.parseSampleId(record);
        continue;
      }

      if (record.type === 'R') {
        const universalId = record.fields[2] || '';
        const parsedTestCode = this.extractInstrumentTestCode(universalId);
        const sequence = Number.parseInt(record.fields[1] || '', 10);
        const parsed: AstmResult = {
          sampleId: currentSampleId,
          testCode: parsedTestCode,
          testName: null,
          value: (record.fields[3] || '').trim(),
          unit: (record.fields[4] || '').trim(),
          referenceRange: (record.fields[5] || '').trim(),
          flag: (record.fields[6] || '').trim(),
          status: (record.fields[8] || '').trim(),
          comments: [],
          sequence: Number.isFinite(sequence) ? sequence : results.length + 1,
          rawRecord: record.raw,
        };
        results.push(parsed);
        continue;
      }

      if (record.type === 'C' && results.length > 0) {
        const commentText = this.parseComment(record.fields[3] || '');
        if (commentText) {
          results[results.length - 1].comments.push(commentText);
        }
      }
    }

    return {
      records,
      results,
      messageType,
      terminationCode,
      protocolVariant,
      sender,
    };
  }

  mapFlag(astmFlag: string): 'N' | 'H' | 'L' | 'HH' | 'LL' | 'POS' | 'NEG' | 'ABN' | null {
    const flag = (astmFlag || '').trim().toUpperCase();
    if (!flag) return null;

    switch (flag) {
      case 'N':
        return 'N';
      case 'H':
        return 'H';
      case 'L':
        return 'L';
      case 'HH':
      case '>':
        return 'HH';
      case 'LL':
      case '<':
        return 'LL';
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
        return 'ABN';
      default:
        return null;
    }
  }

  isLikelyAstm(rawMessage: string): boolean {
    const normalized = this.normalizeInput(rawMessage);
    return /(?:^|\r)H\|/.test(normalized) && /(?:^|\r)[ORL]\|/.test(normalized);
  }

  private normalizeInput(rawMessage: string): string {
    let value = rawMessage || '';

    // Remove ASTM checksum bytes that appear after ETX/ETB before CR/LF.
    value = value.replace(/[\x03\x17][0-9A-Fa-f]{2}\r?\n/g, '\r');

    // Remove low-level control bytes except CR/LF.
    value = value.replace(/[\x02\x03\x04\x05\x06\x10\x15\x17]/g, '');

    value = value.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
    value = value.replace(AstmParserService.CONTROL_CHARS_RE, '');
    return value;
  }

  private splitRecords(normalized: string): AstmRecord[] {
    return normalized
      .split('\r')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const noFramePrefix = line.replace(/^\d(?=[A-Za-z]\|)/, '');
        const recordType = noFramePrefix.charAt(0).toUpperCase();
        const fields = noFramePrefix.split('|');
        return { type: recordType, fields, raw: noFramePrefix };
      });
  }

  private detectMessageType(header: AstmRecord): string {
    const joined = header.fields.join('|').toUpperCase();
    if (joined.includes('RSUPL')) return 'ASTM_RSUPL';
    if (joined.includes('TSREQ')) return 'ASTM_TSREQ';
    if (joined.includes('TSDWN')) return 'ASTM_TSDWN';
    return 'ASTM';
  }

  private detectVariant(header: AstmRecord): 'ELECSYS' | 'COBAS' | 'UNKNOWN' {
    const joined = header.fields.join('|').toLowerCase();
    if (joined.includes('cobas')) return 'COBAS';
    if (joined.includes('elecsys')) return 'ELECSYS';
    return 'UNKNOWN';
  }

  private detectSender(header: AstmRecord): string | null {
    // Sender is usually in header field 4/5 depending on variant.
    const sender = header.fields[4] || header.fields[3] || '';
    const trimmed = sender.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private parseSampleId(orderRecord: AstmRecord): string {
    const direct = (orderRecord.fields[2] || '').trim();
    if (direct) return direct;

    // Some formats may include specimen data in field 3 as component data.
    const specimenField = (orderRecord.fields[3] || '').trim();
    if (!specimenField) return '';
    const parts = specimenField.split('^').map((p) => p.trim()).filter(Boolean);
    return parts[0] || '';
  }

  private extractInstrumentTestCode(universalId: string): string {
    const source = (universalId || '').trim();
    if (!source) return '';

    const parts = source.split('^').map((p) => p.trim());
    let candidate = parts[3] || parts.find((p) => p.length > 0) || source;

    if (candidate.includes('//')) {
      candidate = candidate.split('//')[0].trim();
    }
    if (candidate.includes('/')) {
      candidate = candidate.split('/')[0].trim();
    }
    if (candidate.includes('\\')) {
      candidate = candidate.split('\\')[0].trim();
    }

    return candidate.toUpperCase();
  }

  private parseComment(rawComment: string): string {
    const cleaned = (rawComment || '').trim();
    if (!cleaned) return '';
    const caretIndex = cleaned.indexOf('^');
    if (caretIndex === -1) return cleaned;
    const maybeMessage = cleaned.slice(caretIndex + 1).trim();
    return maybeMessage || cleaned;
  }
}

