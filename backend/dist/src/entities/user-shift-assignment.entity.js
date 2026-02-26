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
exports.UserShiftAssignment = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
const shift_entity_1 = require("./shift.entity");
let UserShiftAssignment = class UserShiftAssignment {
};
exports.UserShiftAssignment = UserShiftAssignment;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'uuid' }),
    __metadata("design:type", String)
], UserShiftAssignment.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'uuid' }),
    __metadata("design:type", String)
], UserShiftAssignment.prototype, "shiftId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'userId' }),
    __metadata("design:type", user_entity_1.User)
], UserShiftAssignment.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => shift_entity_1.Shift, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'shiftId' }),
    __metadata("design:type", shift_entity_1.Shift)
], UserShiftAssignment.prototype, "shift", void 0);
exports.UserShiftAssignment = UserShiftAssignment = __decorate([
    (0, typeorm_1.Entity)('user_shift_assignments')
], UserShiftAssignment);
//# sourceMappingURL=user-shift-assignment.entity.js.map