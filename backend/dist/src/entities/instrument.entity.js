"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstrumentMessage = exports.InstrumentTestMapping = exports.Instrument = exports.InstrumentStatus = exports.ConnectionType = exports.InstrumentProtocol = void 0;
const typeorm_1 = require("typeorm");
const lab_entity_1 = require("./lab.entity");
var InstrumentProtocol;
(function (InstrumentProtocol) {
    InstrumentProtocol["HL7_V2"] = "HL7_V2";
    InstrumentProtocol["ASTM"] = "ASTM";
    InstrumentProtocol["POCT1A"] = "POCT1A";
    InstrumentProtocol["CUSTOM"] = "CUSTOM";
})(InstrumentProtocol || (exports.InstrumentProtocol = InstrumentProtocol = {}));
var ConnectionType;
(function (ConnectionType) {
    ConnectionType["TCP_SERVER"] = "TCP_SERVER";
    ConnectionType["TCP_CLIENT"] = "TCP_CLIENT";
    ConnectionType["SERIAL"] = "SERIAL";
    ConnectionType["FILE_WATCH"] = "FILE_WATCH";
})(ConnectionType || (exports.ConnectionType = ConnectionType = {}));
var InstrumentStatus;
(function (InstrumentStatus) {
    InstrumentStatus["OFFLINE"] = "OFFLINE";
    InstrumentStatus["ONLINE"] = "ONLINE";
    InstrumentStatus["ERROR"] = "ERROR";
    InstrumentStatus["CONNECTING"] = "CONNECTING";
})(InstrumentStatus || (exports.InstrumentStatus = InstrumentStatus = {}));
let Instrument = class Instrument {
};
exports.Instrument = Instrument;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Instrument.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], Instrument.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50 }),
    __metadata("design:type", String)
], Instrument.prototype, "code", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100 }),
    __metadata("design:type", String)
], Instrument.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "manufacturer", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "model", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "serialNumber", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: InstrumentProtocol,
        default: InstrumentProtocol.HL7_V2,
    }),
    __metadata("design:type", String)
], Instrument.prototype, "protocol", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ConnectionType,
        default: ConnectionType.TCP_SERVER,
    }),
    __metadata("design:type", String)
], Instrument.prototype, "connectionType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "host", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "port", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "serialPort", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "baudRate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 10, nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "dataBits", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 10, nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "parity", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 10, nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "stopBits", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 500, nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "watchFolder", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "filePattern", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 10, default: '\x0b' }),
    __metadata("design:type", String)
], Instrument.prototype, "hl7StartBlock", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 10, default: '\x1c\x0d' }),
    __metadata("design:type", String)
], Instrument.prototype, "hl7EndBlock", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "sendingApplication", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "sendingFacility", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "receivingApplication", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "receivingFacility", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: InstrumentStatus,
        default: InstrumentStatus.OFFLINE,
    }),
    __metadata("design:type", String)
], Instrument.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "lastConnectedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "lastMessageAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Instrument.prototype, "lastError", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], Instrument.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], Instrument.prototype, "autoPost", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], Instrument.prototype, "requireVerification", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Instrument.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Instrument.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => lab_entity_1.Lab, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'labId' }),
    __metadata("design:type", lab_entity_1.Lab)
], Instrument.prototype, "lab", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => InstrumentTestMapping, (mapping) => mapping.instrument),
    __metadata("design:type", Array)
], Instrument.prototype, "testMappings", void 0);
exports.Instrument = Instrument = __decorate([
    (0, typeorm_1.Entity)('instruments'),
    (0, typeorm_1.Unique)(['labId', 'code'])
], Instrument);
let InstrumentTestMapping = class InstrumentTestMapping {
};
exports.InstrumentTestMapping = InstrumentTestMapping;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], InstrumentTestMapping.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], InstrumentTestMapping.prototype, "instrumentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], InstrumentTestMapping.prototype, "testId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50 }),
    __metadata("design:type", String)
], InstrumentTestMapping.prototype, "instrumentTestCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], InstrumentTestMapping.prototype, "instrumentTestName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 4, nullable: true }),
    __metadata("design:type", Object)
], InstrumentTestMapping.prototype, "multiplier", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], InstrumentTestMapping.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], InstrumentTestMapping.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], InstrumentTestMapping.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Instrument, (instrument) => instrument.testMappings, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'instrumentId' }),
    __metadata("design:type", Instrument)
], InstrumentTestMapping.prototype, "instrument", void 0);
exports.InstrumentTestMapping = InstrumentTestMapping = __decorate([
    (0, typeorm_1.Entity)('instrument_test_mappings'),
    (0, typeorm_1.Unique)(['instrumentId', 'instrumentTestCode'])
], InstrumentTestMapping);
let InstrumentMessage = class InstrumentMessage {
};
exports.InstrumentMessage = InstrumentMessage;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], InstrumentMessage.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], InstrumentMessage.prototype, "instrumentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], InstrumentMessage.prototype, "direction", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], InstrumentMessage.prototype, "messageType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", Object)
], InstrumentMessage.prototype, "messageControlId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], InstrumentMessage.prototype, "rawMessage", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], InstrumentMessage.prototype, "parsedMessage", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, default: 'RECEIVED' }),
    __metadata("design:type", String)
], InstrumentMessage.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], InstrumentMessage.prototype, "errorMessage", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], InstrumentMessage.prototype, "orderId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], InstrumentMessage.prototype, "orderTestId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], InstrumentMessage.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Instrument, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'instrumentId' }),
    __metadata("design:type", Instrument)
], InstrumentMessage.prototype, "instrument", void 0);
exports.InstrumentMessage = InstrumentMessage = __decorate([
    (0, typeorm_1.Entity)('instrument_messages')
], InstrumentMessage);
//# sourceMappingURL=instrument.entity.js.map