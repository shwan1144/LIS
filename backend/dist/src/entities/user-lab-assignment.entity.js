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
exports.UserLabAssignment = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
const lab_entity_1 = require("./lab.entity");
let UserLabAssignment = class UserLabAssignment {
};
exports.UserLabAssignment = UserLabAssignment;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'uuid' }),
    __metadata("design:type", String)
], UserLabAssignment.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'uuid' }),
    __metadata("design:type", String)
], UserLabAssignment.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, (user) => user.labAssignments, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'userId' }),
    __metadata("design:type", user_entity_1.User)
], UserLabAssignment.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => lab_entity_1.Lab, (lab) => lab.userAssignments, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'labId' }),
    __metadata("design:type", lab_entity_1.Lab)
], UserLabAssignment.prototype, "lab", void 0);
exports.UserLabAssignment = UserLabAssignment = __decorate([
    (0, typeorm_1.Entity)('user_lab_assignments')
], UserLabAssignment);
//# sourceMappingURL=user-lab-assignment.entity.js.map