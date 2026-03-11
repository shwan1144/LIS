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
exports.TestAntibiotic = void 0;
const typeorm_1 = require("typeorm");
const antibiotic_entity_1 = require("./antibiotic.entity");
const test_entity_1 = require("./test.entity");
let TestAntibiotic = class TestAntibiotic {
};
exports.TestAntibiotic = TestAntibiotic;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], TestAntibiotic.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], TestAntibiotic.prototype, "testId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], TestAntibiotic.prototype, "antibioticId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], TestAntibiotic.prototype, "sortOrder", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], TestAntibiotic.prototype, "isDefault", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], TestAntibiotic.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], TestAntibiotic.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => test_entity_1.Test, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'testId' }),
    __metadata("design:type", test_entity_1.Test)
], TestAntibiotic.prototype, "test", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => antibiotic_entity_1.Antibiotic, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'antibioticId' }),
    __metadata("design:type", antibiotic_entity_1.Antibiotic)
], TestAntibiotic.prototype, "antibiotic", void 0);
exports.TestAntibiotic = TestAntibiotic = __decorate([
    (0, typeorm_1.Entity)('test_antibiotics'),
    (0, typeorm_1.Index)('UQ_test_antibiotics_test_antibiotic', ['testId', 'antibioticId'], {
        unique: true,
    })
], TestAntibiotic);
//# sourceMappingURL=test-antibiotic.entity.js.map