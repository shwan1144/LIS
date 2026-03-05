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
exports.User = void 0;
const typeorm_1 = require("typeorm");
const user_lab_assignment_entity_1 = require("./user-lab-assignment.entity");
const user_shift_assignment_entity_1 = require("./user-shift-assignment.entity");
const user_department_assignment_entity_1 = require("./user-department-assignment.entity");
const lab_entity_1 = require("./lab.entity");
let User = class User {
};
exports.User = User;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], User.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 64 }),
    __metadata("design:type", String)
], User.prototype, "username", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], User.prototype, "passwordHash", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "fullName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 32 }),
    __metadata("design:type", String)
], User.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "defaultLabId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], User.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], User.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], User.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => user_lab_assignment_entity_1.UserLabAssignment, (ula) => ula.user),
    __metadata("design:type", Array)
], User.prototype, "labAssignments", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => user_shift_assignment_entity_1.UserShiftAssignment, (usa) => usa.user),
    __metadata("design:type", Array)
], User.prototype, "shiftAssignments", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => user_department_assignment_entity_1.UserDepartmentAssignment, (uda) => uda.user),
    __metadata("design:type", Array)
], User.prototype, "departmentAssignments", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => lab_entity_1.Lab, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'defaultLabId' }),
    __metadata("design:type", Object)
], User.prototype, "defaultLab", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => lab_entity_1.Lab, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'labId' }),
    __metadata("design:type", Object)
], User.prototype, "lab", void 0);
exports.User = User = __decorate([
    (0, typeorm_1.Entity)('users'),
    (0, typeorm_1.Index)('UQ_users_lab_username', ['labId', 'username'], {
        unique: true,
        where: '"labId" IS NOT NULL',
    })
], User);
//# sourceMappingURL=user.entity.js.map