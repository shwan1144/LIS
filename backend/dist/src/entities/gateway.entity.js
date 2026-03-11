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
exports.GatewayMessageReceipt = exports.GatewayToken = exports.GatewayActivationCode = exports.GatewayDevice = exports.GatewayDeviceStatus = void 0;
const typeorm_1 = require("typeorm");
const lab_entity_1 = require("./lab.entity");
const instrument_entity_1 = require("./instrument.entity");
var GatewayDeviceStatus;
(function (GatewayDeviceStatus) {
    GatewayDeviceStatus["ACTIVE"] = "ACTIVE";
    GatewayDeviceStatus["AUTH_ERROR"] = "AUTH_ERROR";
    GatewayDeviceStatus["ERROR"] = "ERROR";
    GatewayDeviceStatus["DISABLED"] = "DISABLED";
})(GatewayDeviceStatus || (exports.GatewayDeviceStatus = GatewayDeviceStatus = {}));
let GatewayDevice = class GatewayDevice {
};
exports.GatewayDevice = GatewayDevice;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], GatewayDevice.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], GatewayDevice.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 120 }),
    __metadata("design:type", String)
], GatewayDevice.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 128 }),
    __metadata("design:type", String)
], GatewayDevice.prototype, "fingerprintHash", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: GatewayDeviceStatus,
        default: GatewayDeviceStatus.ACTIVE,
    }),
    __metadata("design:type", String)
], GatewayDevice.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 32, nullable: true }),
    __metadata("design:type", Object)
], GatewayDevice.prototype, "version", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], GatewayDevice.prototype, "lastSeenAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], GatewayDevice.prototype, "lastHeartbeat", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], GatewayDevice.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], GatewayDevice.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => lab_entity_1.Lab, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'labId' }),
    __metadata("design:type", lab_entity_1.Lab)
], GatewayDevice.prototype, "lab", void 0);
exports.GatewayDevice = GatewayDevice = __decorate([
    (0, typeorm_1.Entity)('gateway_devices'),
    (0, typeorm_1.Index)(['labId']),
    (0, typeorm_1.Index)(['fingerprintHash'])
], GatewayDevice);
let GatewayActivationCode = class GatewayActivationCode {
};
exports.GatewayActivationCode = GatewayActivationCode;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], GatewayActivationCode.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], GatewayActivationCode.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 128, unique: true }),
    __metadata("design:type", String)
], GatewayActivationCode.prototype, "codeHash", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp' }),
    __metadata("design:type", Date)
], GatewayActivationCode.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], GatewayActivationCode.prototype, "usedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], GatewayActivationCode.prototype, "revokedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], GatewayActivationCode.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => lab_entity_1.Lab, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'labId' }),
    __metadata("design:type", lab_entity_1.Lab)
], GatewayActivationCode.prototype, "lab", void 0);
exports.GatewayActivationCode = GatewayActivationCode = __decorate([
    (0, typeorm_1.Entity)('gateway_activation_codes'),
    (0, typeorm_1.Index)(['labId']),
    (0, typeorm_1.Index)(['expiresAt'])
], GatewayActivationCode);
let GatewayToken = class GatewayToken {
};
exports.GatewayToken = GatewayToken;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], GatewayToken.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], GatewayToken.prototype, "gatewayId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], GatewayToken.prototype, "refreshHash", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp' }),
    __metadata("design:type", Date)
], GatewayToken.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], GatewayToken.prototype, "revokedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], GatewayToken.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], GatewayToken.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => GatewayDevice, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'gatewayId' }),
    __metadata("design:type", GatewayDevice)
], GatewayToken.prototype, "gateway", void 0);
exports.GatewayToken = GatewayToken = __decorate([
    (0, typeorm_1.Entity)('gateway_tokens'),
    (0, typeorm_1.Index)(['gatewayId']),
    (0, typeorm_1.Index)(['expiresAt'])
], GatewayToken);
let GatewayMessageReceipt = class GatewayMessageReceipt {
};
exports.GatewayMessageReceipt = GatewayMessageReceipt;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], GatewayMessageReceipt.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], GatewayMessageReceipt.prototype, "gatewayId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 128 }),
    __metadata("design:type", String)
], GatewayMessageReceipt.prototype, "localMessageId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], GatewayMessageReceipt.prototype, "instrumentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], GatewayMessageReceipt.prototype, "serverMessageId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp' }),
    __metadata("design:type", Date)
], GatewayMessageReceipt.prototype, "receivedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => GatewayDevice, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'gatewayId' }),
    __metadata("design:type", GatewayDevice)
], GatewayMessageReceipt.prototype, "gateway", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => instrument_entity_1.Instrument, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'instrumentId' }),
    __metadata("design:type", instrument_entity_1.Instrument)
], GatewayMessageReceipt.prototype, "instrument", void 0);
exports.GatewayMessageReceipt = GatewayMessageReceipt = __decorate([
    (0, typeorm_1.Entity)('gateway_message_receipts'),
    (0, typeorm_1.Unique)('UQ_gateway_message_receipts_gateway_local', ['gatewayId', 'localMessageId']),
    (0, typeorm_1.Index)(['gatewayId']),
    (0, typeorm_1.Index)(['instrumentId'])
], GatewayMessageReceipt);
//# sourceMappingURL=gateway.entity.js.map