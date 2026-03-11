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
exports.UnmatchedInstrumentResult = exports.UnmatchedReason = void 0;
const typeorm_1 = require("typeorm");
const instrument_entity_1 = require("./instrument.entity");
const order_test_entity_1 = require("./order-test.entity");
var UnmatchedReason;
(function (UnmatchedReason) {
    UnmatchedReason["UNORDERED_TEST"] = "UNORDERED_TEST";
    UnmatchedReason["UNMATCHED_SAMPLE"] = "UNMATCHED_SAMPLE";
    UnmatchedReason["NO_MAPPING"] = "NO_MAPPING";
    UnmatchedReason["INVALID_SAMPLE_STATUS"] = "INVALID_SAMPLE_STATUS";
    UnmatchedReason["DUPLICATE_RESULT"] = "DUPLICATE_RESULT";
})(UnmatchedReason || (exports.UnmatchedReason = UnmatchedReason = {}));
let UnmatchedInstrumentResult = class UnmatchedInstrumentResult {
};
exports.UnmatchedInstrumentResult = UnmatchedInstrumentResult;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], UnmatchedInstrumentResult.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], UnmatchedInstrumentResult.prototype, "instrumentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100 }),
    __metadata("design:type", String)
], UnmatchedInstrumentResult.prototype, "sampleIdentifier", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50 }),
    __metadata("design:type", String)
], UnmatchedInstrumentResult.prototype, "instrumentCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], UnmatchedInstrumentResult.prototype, "instrumentTestName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 4, nullable: true }),
    __metadata("design:type", Object)
], UnmatchedInstrumentResult.prototype, "resultValue", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], UnmatchedInstrumentResult.prototype, "resultText", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 32, nullable: true }),
    __metadata("design:type", Object)
], UnmatchedInstrumentResult.prototype, "unit", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: order_test_entity_1.ResultFlag,
        nullable: true,
    }),
    __metadata("design:type", Object)
], UnmatchedInstrumentResult.prototype, "flag", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], UnmatchedInstrumentResult.prototype, "referenceRange", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: UnmatchedReason,
    }),
    __metadata("design:type", String)
], UnmatchedInstrumentResult.prototype, "reason", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], UnmatchedInstrumentResult.prototype, "details", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], UnmatchedInstrumentResult.prototype, "rawMessageId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp' }),
    __metadata("design:type", Date)
], UnmatchedInstrumentResult.prototype, "receivedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, default: 'PENDING' }),
    __metadata("design:type", String)
], UnmatchedInstrumentResult.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], UnmatchedInstrumentResult.prototype, "resolvedOrderTestId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], UnmatchedInstrumentResult.prototype, "resolvedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], UnmatchedInstrumentResult.prototype, "resolvedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], UnmatchedInstrumentResult.prototype, "resolutionNotes", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], UnmatchedInstrumentResult.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], UnmatchedInstrumentResult.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => instrument_entity_1.Instrument, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'instrumentId' }),
    __metadata("design:type", instrument_entity_1.Instrument)
], UnmatchedInstrumentResult.prototype, "instrument", void 0);
exports.UnmatchedInstrumentResult = UnmatchedInstrumentResult = __decorate([
    (0, typeorm_1.Entity)('unmatched_instrument_results'),
    (0, typeorm_1.Index)(['instrumentId', 'status', 'receivedAt']),
    (0, typeorm_1.Index)(['sampleIdentifier'])
], UnmatchedInstrumentResult);
//# sourceMappingURL=unmatched-instrument-result.entity.js.map