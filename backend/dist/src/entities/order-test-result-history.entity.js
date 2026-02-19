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
exports.OrderTestResultHistory = void 0;
const typeorm_1 = require("typeorm");
const order_test_entity_1 = require("./order-test.entity");
const order_test_entity_2 = require("./order-test.entity");
let OrderTestResultHistory = class OrderTestResultHistory {
};
exports.OrderTestResultHistory = OrderTestResultHistory;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], OrderTestResultHistory.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], OrderTestResultHistory.prototype, "orderTestId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 4, nullable: true }),
    __metadata("design:type", Object)
], OrderTestResultHistory.prototype, "resultValue", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], OrderTestResultHistory.prototype, "resultText", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 32, nullable: true }),
    __metadata("design:type", Object)
], OrderTestResultHistory.prototype, "unit", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: order_test_entity_2.ResultFlag,
        nullable: true,
    }),
    __metadata("design:type", Object)
], OrderTestResultHistory.prototype, "flag", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], OrderTestResultHistory.prototype, "referenceRange", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp' }),
    __metadata("design:type", Date)
], OrderTestResultHistory.prototype, "receivedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], OrderTestResultHistory.prototype, "messageId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", Object)
], OrderTestResultHistory.prototype, "obxSetId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Object)
], OrderTestResultHistory.prototype, "obxSequence", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", Object)
], OrderTestResultHistory.prototype, "instrumentCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], OrderTestResultHistory.prototype, "comments", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], OrderTestResultHistory.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => order_test_entity_1.OrderTest, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'orderTestId' }),
    __metadata("design:type", order_test_entity_1.OrderTest)
], OrderTestResultHistory.prototype, "orderTest", void 0);
exports.OrderTestResultHistory = OrderTestResultHistory = __decorate([
    (0, typeorm_1.Entity)('order_test_result_history'),
    (0, typeorm_1.Index)(['orderTestId', 'receivedAt']),
    (0, typeorm_1.Index)(['messageId'])
], OrderTestResultHistory);
//# sourceMappingURL=order-test-result-history.entity.js.map