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
exports.Sample = exports.TubeType = void 0;
const typeorm_1 = require("typeorm");
const order_entity_1 = require("./order.entity");
const order_test_entity_1 = require("./order-test.entity");
const lab_entity_1 = require("./lab.entity");
var TubeType;
(function (TubeType) {
    TubeType["SERUM"] = "SERUM";
    TubeType["PLASMA"] = "PLASMA";
    TubeType["WHOLE_BLOOD"] = "WHOLE_BLOOD";
    TubeType["URINE"] = "URINE";
    TubeType["STOOL"] = "STOOL";
    TubeType["SWAB"] = "SWAB";
    TubeType["OTHER"] = "OTHER";
})(TubeType || (exports.TubeType = TubeType = {}));
let Sample = class Sample {
};
exports.Sample = Sample;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Sample.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], Sample.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], Sample.prototype, "orderId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 64, nullable: true }),
    __metadata("design:type", Object)
], Sample.prototype, "sampleId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: TubeType,
        nullable: true,
    }),
    __metadata("design:type", Object)
], Sample.prototype, "tubeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 128, nullable: true }),
    __metadata("design:type", Object)
], Sample.prototype, "barcode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Object)
], Sample.prototype, "sequenceNumber", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 512, nullable: true }),
    __metadata("design:type", Object)
], Sample.prototype, "qrCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], Sample.prototype, "collectedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Sample.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Sample.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Sample.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => order_entity_1.Order, (order) => order.samples, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'orderId' }),
    __metadata("design:type", order_entity_1.Order)
], Sample.prototype, "order", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => lab_entity_1.Lab, { nullable: true, onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'labId' }),
    __metadata("design:type", Object)
], Sample.prototype, "lab", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => order_test_entity_1.OrderTest, (orderTest) => orderTest.sample, { cascade: true }),
    __metadata("design:type", Array)
], Sample.prototype, "orderTests", void 0);
exports.Sample = Sample = __decorate([
    (0, typeorm_1.Entity)('samples'),
    (0, typeorm_1.Index)('IDX_samples_lab_barcode', ['labId', 'barcode'], {
        where: '"barcode" IS NOT NULL',
    })
], Sample);
//# sourceMappingURL=sample.entity.js.map