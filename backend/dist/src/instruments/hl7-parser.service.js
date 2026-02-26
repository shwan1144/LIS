"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HL7ParserService = void 0;
const common_1 = require("@nestjs/common");
let HL7ParserService = class HL7ParserService {
    constructor() {
        this.FIELD_SEPARATOR = '|';
        this.COMPONENT_SEPARATOR = '^';
        this.SUBCOMPONENT_SEPARATOR = '&';
        this.REPETITION_SEPARATOR = '~';
        this.ESCAPE_CHARACTER = '\\';
    }
    parseMessage(rawMessage) {
        const cleanMessage = this.removeMLLPFraming(rawMessage);
        const segmentStrings = cleanMessage.split(/\r\n|\r|\n/).filter(s => s.trim());
        if (segmentStrings.length === 0) {
            throw new Error('Empty HL7 message');
        }
        const mshSegment = segmentStrings[0];
        if (!mshSegment.startsWith('MSH')) {
            throw new Error('Invalid HL7 message: must start with MSH segment');
        }
        const segments = segmentStrings.map(segStr => this.parseSegment(segStr));
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
    parseORU(rawMessage) {
        const message = this.parseMessage(rawMessage);
        if (!message.messageType.startsWith('ORU')) {
            throw new Error(`Expected ORU message, got ${message.messageType}`);
        }
        const results = [];
        let currentPatientId = '';
        let currentPatientName = '';
        let currentSampleId = '';
        for (let i = 0; i < message.segments.length; i++) {
            const segment = message.segments[i];
            if (segment.name === 'PID') {
                currentPatientId = this.getField(segment, 3) || '';
                const nameField = this.getField(segment, 5) || '';
                const nameParts = nameField.split(this.COMPONENT_SEPARATOR);
                currentPatientName = nameParts.length >= 2
                    ? `${nameParts[1]} ${nameParts[0]}`.trim()
                    : nameField;
            }
            if (segment.name === 'OBR') {
                currentSampleId = this.getField(segment, 3) || this.getField(segment, 2) || '';
            }
            if (segment.name === 'OBX') {
                const result = this.parseOBXSegment(segment, {
                    patientId: currentPatientId,
                    patientName: currentPatientName,
                    sampleId: currentSampleId,
                });
                const comments = [];
                for (let j = i + 1; j < message.segments.length; j++) {
                    if (message.segments[j].name === 'NTE') {
                        const comment = this.getField(message.segments[j], 3) || '';
                        if (comment)
                            comments.push(comment);
                    }
                    else if (message.segments[j].name !== 'NTE') {
                        break;
                    }
                }
                result.comments = comments;
                results.push(result);
            }
        }
        return { message, results };
    }
    parseOBXSegment(segment, context) {
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
            flag: this.getField(segment, 8) || '',
            status: this.getField(segment, 11) || '',
            observationDateTime: this.getField(segment, 14) || '',
            performingLab: this.getField(segment, 15) || '',
            comments: [],
        };
    }
    generateACK(originalMessage, ackCode, errorMessage) {
        const now = new Date();
        const timestamp = this.formatHL7DateTime(now);
        const messageControlId = `ACK${now.getTime()}`;
        const segments = [
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
                'P',
                '2.5',
            ].join(this.FIELD_SEPARATOR),
            [
                'MSA',
                ackCode,
                originalMessage.messageControlId,
                errorMessage || '',
            ].join(this.FIELD_SEPARATOR),
        ];
        if (ackCode !== 'AA' && errorMessage) {
            segments.push([
                'ERR',
                '',
                '',
                '',
                errorMessage,
            ].join(this.FIELD_SEPARATOR));
        }
        return segments.join('\r');
    }
    generateORM(orderData) {
        const now = new Date();
        const timestamp = this.formatHL7DateTime(now);
        const segments = [
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
            [
                'PV1',
                '1',
                'O',
            ].join(this.FIELD_SEPARATOR),
        ];
        orderData.tests.forEach((test, index) => {
            segments.push([
                'ORC',
                'NW',
                orderData.orderNumber,
                '',
                '',
                '',
                '',
                '',
                orderData.orderDateTime || timestamp,
            ].join(this.FIELD_SEPARATOR));
            segments.push([
                'OBR',
                (index + 1).toString(),
                orderData.orderNumber,
                orderData.orderNumber,
                `${test.code}^${test.name}`,
                orderData.priority || 'R',
                orderData.orderDateTime || timestamp,
            ].join(this.FIELD_SEPARATOR));
        });
        return segments.join('\r');
    }
    parseSegment(segmentString) {
        const fields = segmentString.split(this.FIELD_SEPARATOR);
        const name = fields[0];
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
    getField(segment, fieldIndex, componentIndex) {
        const field = segment.fields[fieldIndex];
        if (field === undefined)
            return undefined;
        if (componentIndex !== undefined) {
            const components = field.split(this.COMPONENT_SEPARATOR);
            return components[componentIndex];
        }
        return field;
    }
    formatHL7DateTime(date) {
        const pad = (n) => n.toString().padStart(2, '0');
        return (date.getFullYear().toString() +
            pad(date.getMonth() + 1) +
            pad(date.getDate()) +
            pad(date.getHours()) +
            pad(date.getMinutes()) +
            pad(date.getSeconds()));
    }
    parseHL7DateTime(hl7DateTime) {
        if (!hl7DateTime || hl7DateTime.length < 8)
            return null;
        const year = parseInt(hl7DateTime.substring(0, 4), 10);
        const month = parseInt(hl7DateTime.substring(4, 6), 10) - 1;
        const day = parseInt(hl7DateTime.substring(6, 8), 10);
        const hour = hl7DateTime.length >= 10 ? parseInt(hl7DateTime.substring(8, 10), 10) : 0;
        const minute = hl7DateTime.length >= 12 ? parseInt(hl7DateTime.substring(10, 12), 10) : 0;
        const second = hl7DateTime.length >= 14 ? parseInt(hl7DateTime.substring(12, 14), 10) : 0;
        return new Date(year, month, day, hour, minute, second);
    }
    removeMLLPFraming(message) {
        let result = message;
        if (result.charCodeAt(0) === 0x0b) {
            result = result.substring(1);
        }
        if (result.charCodeAt(result.length - 1) === 0x0d) {
            result = result.substring(0, result.length - 1);
        }
        if (result.charCodeAt(result.length - 1) === 0x1c) {
            result = result.substring(0, result.length - 1);
        }
        return result.trim();
    }
    addMLLPFraming(message) {
        const VT = String.fromCharCode(0x0b);
        const FS = String.fromCharCode(0x1c);
        const CR = String.fromCharCode(0x0d);
        return VT + message + FS + CR;
    }
    mapFlag(hl7Flag) {
        const flag = hl7Flag?.toUpperCase();
        switch (flag) {
            case 'N':
                return 'N';
            case 'H':
                return 'H';
            case 'L':
                return 'L';
            case 'HH':
            case 'PH':
            case '>':
                return 'HH';
            case 'LL':
            case 'PL':
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
};
exports.HL7ParserService = HL7ParserService;
exports.HL7ParserService = HL7ParserService = __decorate([
    (0, common_1.Injectable)()
], HL7ParserService);
//# sourceMappingURL=hl7-parser.service.js.map