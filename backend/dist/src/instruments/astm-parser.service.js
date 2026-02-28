"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AstmParserService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AstmParserService = void 0;
const common_1 = require("@nestjs/common");
let AstmParserService = AstmParserService_1 = class AstmParserService {
    parseMessage(rawMessage) {
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
        const results = [];
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
                const parsed = {
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
    mapFlag(astmFlag) {
        const flag = (astmFlag || '').trim().toUpperCase();
        if (!flag)
            return null;
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
    isLikelyAstm(rawMessage) {
        const normalized = this.normalizeInput(rawMessage);
        return /(?:^|\r)H\|/.test(normalized) && /(?:^|\r)[ORL]\|/.test(normalized);
    }
    normalizeInput(rawMessage) {
        let value = rawMessage || '';
        value = value.replace(/[\x03\x17][0-9A-Fa-f]{2}\r?\n/g, '\r');
        value = value.replace(/[\x02\x03\x04\x05\x06\x10\x15\x17]/g, '');
        value = value.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
        value = value.replace(AstmParserService_1.CONTROL_CHARS_RE, '');
        return value;
    }
    splitRecords(normalized) {
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
    detectMessageType(header) {
        const joined = header.fields.join('|').toUpperCase();
        if (joined.includes('RSUPL'))
            return 'ASTM_RSUPL';
        if (joined.includes('TSREQ'))
            return 'ASTM_TSREQ';
        if (joined.includes('TSDWN'))
            return 'ASTM_TSDWN';
        return 'ASTM';
    }
    detectVariant(header) {
        const joined = header.fields.join('|').toLowerCase();
        if (joined.includes('cobas'))
            return 'COBAS';
        if (joined.includes('elecsys'))
            return 'ELECSYS';
        return 'UNKNOWN';
    }
    detectSender(header) {
        const sender = header.fields[4] || header.fields[3] || '';
        const trimmed = sender.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    parseSampleId(orderRecord) {
        const direct = (orderRecord.fields[2] || '').trim();
        if (direct)
            return direct;
        const specimenField = (orderRecord.fields[3] || '').trim();
        if (!specimenField)
            return '';
        const parts = specimenField.split('^').map((p) => p.trim()).filter(Boolean);
        return parts[0] || '';
    }
    extractInstrumentTestCode(universalId) {
        const source = (universalId || '').trim();
        if (!source)
            return '';
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
    parseComment(rawComment) {
        const cleaned = (rawComment || '').trim();
        if (!cleaned)
            return '';
        const caretIndex = cleaned.indexOf('^');
        if (caretIndex === -1)
            return cleaned;
        const maybeMessage = cleaned.slice(caretIndex + 1).trim();
        return maybeMessage || cleaned;
    }
};
exports.AstmParserService = AstmParserService;
AstmParserService.CONTROL_CHARS_RE = /[\x00-\x08\x0b-\x0c\x0e-\x1a\x1c-\x1f]/g;
exports.AstmParserService = AstmParserService = AstmParserService_1 = __decorate([
    (0, common_1.Injectable)()
], AstmParserService);
//# sourceMappingURL=astm-parser.service.js.map