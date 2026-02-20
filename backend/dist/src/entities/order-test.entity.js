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
exports.OrderTest = exports.ResultFlag = exports.OrderTestStatus = void 0;
const typeorm_1 = require("typeorm");
const sample_entity_1 = require("./sample.entity");
const test_entity_1 = require("./test.entity");
const lab_entity_1 = require("./lab.entity");
var OrderTestStatus;
(function (OrderTestStatus) {
    OrderTestStatus["PENDING"] = "PENDING";
    OrderTestStatus["IN_PROGRESS"] = "IN_PROGRESS";
    OrderTestStatus["COMPLETED"] = "COMPLETED";
    OrderTestStatus["VERIFIED"] = "VERIFIED";
    OrderTestStatus["REJECTED"] = "REJECTED";
})(OrderTestStatus || (exports.OrderTestStatus = OrderTestStatus = {}));
var ResultFlag;
(function (ResultFlag) {
    ResultFlag["NORMAL"] = "N";
    ResultFlag["HIGH"] = "H";
    ResultFlag["LOW"] = "L";
    ResultFlag["CRITICAL_HIGH"] = "HH";
    ResultFlag["CRITICAL_LOW"] = "LL";
    ResultFlag["POSITIVE"] = "POS";
    ResultFlag["NEGATIVE"] = "NEG";
    ResultFlag["ABNORMAL"] = "ABN";
})(ResultFlag || (exports.ResultFlag = ResultFlag = {}));
let OrderTest = class OrderTest {
};
exports.OrderTest = OrderTest;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], OrderTest.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], OrderTest.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], OrderTest.prototype, "sampleId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], OrderTest.prototype, "testId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], OrderTest.prototype, "parentOrderTestId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: OrderTestStatus,
        default: OrderTestStatus.PENDING,
    }),
    __metadata("design:type", String)
], OrderTest.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Object)
], OrderTest.prototype, "price", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 4, nullable: true }),
    __metadata("design:type", Object)
], OrderTest.prototype, "resultValue", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], OrderTest.prototype, "resultText", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], OrderTest.prototype, "resultParameters", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ResultFlag,
        nullable: true,
    }),
    __metadata("design:type", Object)
], OrderTest.prototype, "flag", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], OrderTest.prototype, "resultedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], OrderTest.prototype, "resultedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], OrderTest.prototype, "verifiedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], OrderTest.prototype, "verifiedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], OrderTest.prototype, "rejectionReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], OrderTest.prototype, "comments", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], OrderTest.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], OrderTest.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => sample_entity_1.Sample, (sample) => sample.orderTests, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'sampleId' }),
    __metadata("design:type", sample_entity_1.Sample)
], OrderTest.prototype, "sample", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => lab_entity_1.Lab, { nullable: true, onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'labId' }),
    __metadata("design:type", Object)
], OrderTest.prototype, "lab", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => test_entity_1.Test, { onDelete: 'RESTRICT' }),
    (0, typeorm_1.JoinColumn)({ name: 'testId' }),
    __metadata("design:type", test_entity_1.Test)
], OrderTest.prototype, "test", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => OrderTest, (orderTest) => orderTest.childOrderTests, { nullable: true, onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'parentOrderTestId' }),
    __metadata("design:type", Object)
], OrderTest.prototype, "parentOrderTest", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => OrderTest, (orderTest) => orderTest.parentOrderTest),
    __metadata("design:type", Array)
], OrderTest.prototype, "childOrderTests", void 0);
exports.OrderTest = OrderTest = __decorate([
    (0, typeorm_1.Entity)('order_tests')
], OrderTest);
//# sourceMappingURL=order-test.entity.js.map