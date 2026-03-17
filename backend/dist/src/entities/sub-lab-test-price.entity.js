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
exports.SubLabTestPrice = void 0;
const typeorm_1 = require("typeorm");
const sub_lab_entity_1 = require("./sub-lab.entity");
const test_entity_1 = require("./test.entity");
let SubLabTestPrice = class SubLabTestPrice {
};
exports.SubLabTestPrice = SubLabTestPrice;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], SubLabTestPrice.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], SubLabTestPrice.prototype, "subLabId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], SubLabTestPrice.prototype, "testId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], SubLabTestPrice.prototype, "price", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], SubLabTestPrice.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], SubLabTestPrice.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], SubLabTestPrice.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => sub_lab_entity_1.SubLab, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'subLabId' }),
    __metadata("design:type", sub_lab_entity_1.SubLab)
], SubLabTestPrice.prototype, "subLab", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => test_entity_1.Test, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'testId' }),
    __metadata("design:type", test_entity_1.Test)
], SubLabTestPrice.prototype, "test", void 0);
exports.SubLabTestPrice = SubLabTestPrice = __decorate([
    (0, typeorm_1.Entity)('sub_lab_test_prices'),
    (0, typeorm_1.Unique)('UQ_sub_lab_test_prices_sub_lab_test', ['subLabId', 'testId']),
    (0, typeorm_1.Index)('IDX_sub_lab_test_prices_sub_lab_active', ['subLabId', 'isActive'])
], SubLabTestPrice);
//# sourceMappingURL=sub-lab-test-price.entity.js.map