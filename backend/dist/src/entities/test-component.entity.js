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
exports.TestComponent = void 0;
const typeorm_1 = require("typeorm");
const test_entity_1 = require("./test.entity");
let TestComponent = class TestComponent {
};
exports.TestComponent = TestComponent;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'uuid' }),
    __metadata("design:type", String)
], TestComponent.prototype, "panelTestId", void 0);
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'uuid' }),
    __metadata("design:type", String)
], TestComponent.prototype, "childTestId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], TestComponent.prototype, "required", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], TestComponent.prototype, "sortOrder", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", Object)
], TestComponent.prototype, "reportSection", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", Object)
], TestComponent.prototype, "reportGroup", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], TestComponent.prototype, "effectiveFrom", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], TestComponent.prototype, "effectiveTo", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], TestComponent.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], TestComponent.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => test_entity_1.Test, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'panelTestId' }),
    __metadata("design:type", test_entity_1.Test)
], TestComponent.prototype, "panelTest", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => test_entity_1.Test, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'childTestId' }),
    __metadata("design:type", test_entity_1.Test)
], TestComponent.prototype, "childTest", void 0);
exports.TestComponent = TestComponent = __decorate([
    (0, typeorm_1.Entity)('test_components'),
    (0, typeorm_1.Index)(['panelTestId', 'sortOrder'])
], TestComponent);
//# sourceMappingURL=test-component.entity.js.map