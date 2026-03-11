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
exports.MarketingMessageRecipient = exports.MarketingMessageBatch = exports.LabMarketingTemplate = exports.LabMessagingChannelConfig = exports.MarketingMessageRecipientStatus = exports.MarketingMessageBatchStatus = exports.MarketingChannel = void 0;
const typeorm_1 = require("typeorm");
const lab_entity_1 = require("./lab.entity");
const platform_user_entity_1 = require("./platform-user.entity");
const order_entity_1 = require("./order.entity");
const patient_entity_1 = require("./patient.entity");
var MarketingChannel;
(function (MarketingChannel) {
    MarketingChannel["WHATSAPP"] = "WHATSAPP";
    MarketingChannel["VIBER"] = "VIBER";
    MarketingChannel["SMS"] = "SMS";
})(MarketingChannel || (exports.MarketingChannel = MarketingChannel = {}));
var MarketingMessageBatchStatus;
(function (MarketingMessageBatchStatus) {
    MarketingMessageBatchStatus["QUEUED"] = "QUEUED";
    MarketingMessageBatchStatus["RUNNING"] = "RUNNING";
    MarketingMessageBatchStatus["COMPLETED"] = "COMPLETED";
    MarketingMessageBatchStatus["COMPLETED_WITH_ERRORS"] = "COMPLETED_WITH_ERRORS";
    MarketingMessageBatchStatus["FAILED"] = "FAILED";
})(MarketingMessageBatchStatus || (exports.MarketingMessageBatchStatus = MarketingMessageBatchStatus = {}));
var MarketingMessageRecipientStatus;
(function (MarketingMessageRecipientStatus) {
    MarketingMessageRecipientStatus["PENDING"] = "PENDING";
    MarketingMessageRecipientStatus["SENT"] = "SENT";
    MarketingMessageRecipientStatus["FAILED"] = "FAILED";
    MarketingMessageRecipientStatus["SKIPPED"] = "SKIPPED";
})(MarketingMessageRecipientStatus || (exports.MarketingMessageRecipientStatus = MarketingMessageRecipientStatus = {}));
let LabMessagingChannelConfig = class LabMessagingChannelConfig {
};
exports.LabMessagingChannelConfig = LabMessagingChannelConfig;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], LabMessagingChannelConfig.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], LabMessagingChannelConfig.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: MarketingChannel,
        enumName: 'marketing_channel_enum',
    }),
    __metadata("design:type", String)
], LabMessagingChannelConfig.prototype, "channel", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], LabMessagingChannelConfig.prototype, "enabled", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 512, nullable: true }),
    __metadata("design:type", Object)
], LabMessagingChannelConfig.prototype, "webhookUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 512, nullable: true }),
    __metadata("design:type", Object)
], LabMessagingChannelConfig.prototype, "authToken", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 120, nullable: true }),
    __metadata("design:type", Object)
], LabMessagingChannelConfig.prototype, "senderLabel", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'integer', default: 10000 }),
    __metadata("design:type", Number)
], LabMessagingChannelConfig.prototype, "timeoutMs", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'integer', default: 2 }),
    __metadata("design:type", Number)
], LabMessagingChannelConfig.prototype, "maxRetries", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], LabMessagingChannelConfig.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], LabMessagingChannelConfig.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => lab_entity_1.Lab, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'labId' }),
    __metadata("design:type", lab_entity_1.Lab)
], LabMessagingChannelConfig.prototype, "lab", void 0);
exports.LabMessagingChannelConfig = LabMessagingChannelConfig = __decorate([
    (0, typeorm_1.Entity)('lab_messaging_channel_configs'),
    (0, typeorm_1.Unique)('UQ_lab_messaging_channel_configs_lab_channel', ['labId', 'channel'])
], LabMessagingChannelConfig);
let LabMarketingTemplate = class LabMarketingTemplate {
};
exports.LabMarketingTemplate = LabMarketingTemplate;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], LabMarketingTemplate.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], LabMarketingTemplate.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: MarketingChannel,
        enumName: 'marketing_channel_enum',
    }),
    __metadata("design:type", String)
], LabMarketingTemplate.prototype, "channel", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', default: '' }),
    __metadata("design:type", String)
], LabMarketingTemplate.prototype, "templateText", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], LabMarketingTemplate.prototype, "updatedBy", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], LabMarketingTemplate.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], LabMarketingTemplate.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => lab_entity_1.Lab, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'labId' }),
    __metadata("design:type", lab_entity_1.Lab)
], LabMarketingTemplate.prototype, "lab", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => platform_user_entity_1.PlatformUser, { onDelete: 'SET NULL', nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'updatedBy' }),
    __metadata("design:type", Object)
], LabMarketingTemplate.prototype, "updatedByUser", void 0);
exports.LabMarketingTemplate = LabMarketingTemplate = __decorate([
    (0, typeorm_1.Entity)('lab_marketing_templates'),
    (0, typeorm_1.Unique)('UQ_lab_marketing_templates_lab_channel', ['labId', 'channel'])
], LabMarketingTemplate);
let MarketingMessageBatch = class MarketingMessageBatch {
};
exports.MarketingMessageBatch = MarketingMessageBatch;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], MarketingMessageBatch.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], MarketingMessageBatch.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], MarketingMessageBatch.prototype, "createdBy", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: MarketingMessageBatchStatus,
        enumName: 'marketing_message_batch_status_enum',
        default: MarketingMessageBatchStatus.QUEUED,
    }),
    __metadata("design:type", String)
], MarketingMessageBatch.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', default: () => "'[]'::jsonb" }),
    __metadata("design:type", Array)
], MarketingMessageBatch.prototype, "channels", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', default: () => "'{}'::jsonb" }),
    __metadata("design:type", Object)
], MarketingMessageBatch.prototype, "scope", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', default: () => "'[]'::jsonb" }),
    __metadata("design:type", Array)
], MarketingMessageBatch.prototype, "excludedPhones", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], MarketingMessageBatch.prototype, "requestedRecipientsCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], MarketingMessageBatch.prototype, "sentCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], MarketingMessageBatch.prototype, "failedCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], MarketingMessageBatch.prototype, "skippedCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], MarketingMessageBatch.prototype, "startedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], MarketingMessageBatch.prototype, "completedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], MarketingMessageBatch.prototype, "errorMessage", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], MarketingMessageBatch.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], MarketingMessageBatch.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => lab_entity_1.Lab, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'labId' }),
    __metadata("design:type", lab_entity_1.Lab)
], MarketingMessageBatch.prototype, "lab", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => platform_user_entity_1.PlatformUser, { onDelete: 'SET NULL', nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'createdBy' }),
    __metadata("design:type", Object)
], MarketingMessageBatch.prototype, "createdByUser", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => MarketingMessageRecipient, (recipient) => recipient.batch),
    __metadata("design:type", Array)
], MarketingMessageBatch.prototype, "recipients", void 0);
exports.MarketingMessageBatch = MarketingMessageBatch = __decorate([
    (0, typeorm_1.Entity)('marketing_message_batches'),
    (0, typeorm_1.Index)('IDX_marketing_message_batches_lab_createdAt', ['labId', 'createdAt']),
    (0, typeorm_1.Index)('IDX_marketing_message_batches_status_createdAt', ['status', 'createdAt'])
], MarketingMessageBatch);
let MarketingMessageRecipient = class MarketingMessageRecipient {
};
exports.MarketingMessageRecipient = MarketingMessageRecipient;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], MarketingMessageRecipient.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], MarketingMessageRecipient.prototype, "batchId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], MarketingMessageRecipient.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: MarketingChannel,
        enumName: 'marketing_channel_enum',
    }),
    __metadata("design:type", String)
], MarketingMessageRecipient.prototype, "channel", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: MarketingMessageRecipientStatus,
        enumName: 'marketing_message_recipient_status_enum',
        default: MarketingMessageRecipientStatus.PENDING,
    }),
    __metadata("design:type", String)
], MarketingMessageRecipient.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], MarketingMessageRecipient.prototype, "orderId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], MarketingMessageRecipient.prototype, "patientId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], MarketingMessageRecipient.prototype, "recipientName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 64, nullable: true }),
    __metadata("design:type", Object)
], MarketingMessageRecipient.prototype, "recipientPhoneRaw", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 32 }),
    __metadata("design:type", String)
], MarketingMessageRecipient.prototype, "recipientPhoneNormalized", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], MarketingMessageRecipient.prototype, "messageText", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], MarketingMessageRecipient.prototype, "attemptCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], MarketingMessageRecipient.prototype, "lastAttemptAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], MarketingMessageRecipient.prototype, "sentAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], MarketingMessageRecipient.prototype, "errorMessage", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], MarketingMessageRecipient.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], MarketingMessageRecipient.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => MarketingMessageBatch, (batch) => batch.recipients, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'batchId' }),
    __metadata("design:type", MarketingMessageBatch)
], MarketingMessageRecipient.prototype, "batch", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => lab_entity_1.Lab, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'labId' }),
    __metadata("design:type", lab_entity_1.Lab)
], MarketingMessageRecipient.prototype, "lab", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => order_entity_1.Order, { onDelete: 'SET NULL', nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'orderId' }),
    __metadata("design:type", Object)
], MarketingMessageRecipient.prototype, "order", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => patient_entity_1.Patient, { onDelete: 'SET NULL', nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'patientId' }),
    __metadata("design:type", Object)
], MarketingMessageRecipient.prototype, "patient", void 0);
exports.MarketingMessageRecipient = MarketingMessageRecipient = __decorate([
    (0, typeorm_1.Entity)('marketing_message_recipients'),
    (0, typeorm_1.Index)('IDX_marketing_message_recipients_batch_status', ['batchId', 'status']),
    (0, typeorm_1.Index)('IDX_marketing_message_recipients_batch_channel', ['batchId', 'channel'])
], MarketingMessageRecipient);
//# sourceMappingURL=marketing-message.entity.js.map