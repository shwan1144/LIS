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
exports.Lab = void 0;
const typeorm_1 = require("typeorm");
const user_lab_assignment_entity_1 = require("./user-lab-assignment.entity");
const shift_entity_1 = require("./shift.entity");
const department_entity_1 = require("./department.entity");
let Lab = class Lab {
};
exports.Lab = Lab;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Lab.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 32, unique: true }),
    __metadata("design:type", String)
], Lab.prototype, "code", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], Lab.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 64, default: 'UTC' }),
    __metadata("design:type", String)
], Lab.prototype, "timezone", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], Lab.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 32, default: 'tube_type' }),
    __metadata("design:type", String)
], Lab.prototype, "labelSequenceBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 32, default: 'day' }),
    __metadata("design:type", String)
], Lab.prototype, "sequenceResetBy", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Lab.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Lab.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => user_lab_assignment_entity_1.UserLabAssignment, (ula) => ula.lab),
    __metadata("design:type", Array)
], Lab.prototype, "userAssignments", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => shift_entity_1.Shift, (shift) => shift.lab),
    __metadata("design:type", Array)
], Lab.prototype, "shifts", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => department_entity_1.Department, (dept) => dept.lab),
    __metadata("design:type", Array)
], Lab.prototype, "departments", void 0);
exports.Lab = Lab = __decorate([
    (0, typeorm_1.Entity)('labs')
], Lab);
//# sourceMappingURL=lab.entity.js.map