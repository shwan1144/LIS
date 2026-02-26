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
exports.Test = exports.TubeType = exports.TestType = void 0;
const typeorm_1 = require("typeorm");
const order_test_entity_1 = require("./order-test.entity");
const department_entity_1 = require("./department.entity");
const lab_entity_1 = require("./lab.entity");
var TestType;
(function (TestType) {
    TestType["SINGLE"] = "SINGLE";
    TestType["PANEL"] = "PANEL";
})(TestType || (exports.TestType = TestType = {}));
var TubeType;
(function (TubeType) {
    TubeType["SERUM"] = "SERUM";
    TubeType["PLASMA"] = "PLASMA";
    TubeType["WHOLE_BLOOD"] = "WHOLE_BLOOD";
    TubeType["URINE"] = "URINE";
    TubeType["STOOL"] = "STOOL";
    TubeType["SWAB"] = "SWAB";
    TubeType["CSF"] = "CSF";
    TubeType["OTHER"] = "OTHER";
})(TubeType || (exports.TubeType = TubeType = {}));
let Test = class Test {
};
exports.Test = Test;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Test.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], Test.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => lab_entity_1.Lab, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'labId' }),
    __metadata("design:type", lab_entity_1.Lab)
], Test.prototype, "lab", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 64 }),
    __metadata("design:type", String)
], Test.prototype, "code", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], Test.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 32, nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "abbreviation", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: TestType,
        default: TestType.SINGLE,
    }),
    __metadata("design:type", String)
], Test.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: TubeType,
        default: TubeType.SERUM,
    }),
    __metadata("design:type", String)
], Test.prototype, "tubeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "departmentId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => department_entity_1.Department, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'departmentId' }),
    __metadata("design:type", Object)
], Test.prototype, "department", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 128, nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "category", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 32, nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "unit", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 4, nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "normalMin", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 4, nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "normalMax", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 4, nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "normalMinMale", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 4, nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "normalMaxMale", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 4, nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "normalMinFemale", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 4, nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "normalMaxFemale", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "normalText", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 16, default: 'NUMERIC' }),
    __metadata("design:type", String)
], Test.prototype, "resultEntryType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "resultTextOptions", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], Test.prototype, "allowCustomResultText", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "numericAgeRanges", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "childTestIds", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "parameterDefinitions", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], Test.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], Test.prototype, "sortOrder", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Object)
], Test.prototype, "expectedCompletionMinutes", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Test.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Test.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => order_test_entity_1.OrderTest, (orderTest) => orderTest.test),
    __metadata("design:type", Array)
], Test.prototype, "orderTests", void 0);
exports.Test = Test = __decorate([
    (0, typeorm_1.Entity)('tests'),
    (0, typeorm_1.Index)('UQ_tests_lab_code', ['labId', 'code'], { unique: true })
], Test);
//# sourceMappingURL=test.entity.js.map