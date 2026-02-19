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
exports.AuditLog = exports.AuditAction = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
const lab_entity_1 = require("./lab.entity");
var AuditAction;
(function (AuditAction) {
    AuditAction["LOGIN"] = "LOGIN";
    AuditAction["LOGOUT"] = "LOGOUT";
    AuditAction["LOGIN_FAILED"] = "LOGIN_FAILED";
    AuditAction["PATIENT_CREATE"] = "PATIENT_CREATE";
    AuditAction["PATIENT_UPDATE"] = "PATIENT_UPDATE";
    AuditAction["ORDER_CREATE"] = "ORDER_CREATE";
    AuditAction["ORDER_UPDATE"] = "ORDER_UPDATE";
    AuditAction["ORDER_CANCEL"] = "ORDER_CANCEL";
    AuditAction["RESULT_ENTER"] = "RESULT_ENTER";
    AuditAction["RESULT_UPDATE"] = "RESULT_UPDATE";
    AuditAction["RESULT_VERIFY"] = "RESULT_VERIFY";
    AuditAction["RESULT_REJECT"] = "RESULT_REJECT";
    AuditAction["TEST_CREATE"] = "TEST_CREATE";
    AuditAction["TEST_UPDATE"] = "TEST_UPDATE";
    AuditAction["TEST_DELETE"] = "TEST_DELETE";
    AuditAction["USER_CREATE"] = "USER_CREATE";
    AuditAction["USER_UPDATE"] = "USER_UPDATE";
    AuditAction["USER_DELETE"] = "USER_DELETE";
    AuditAction["SHIFT_CREATE"] = "SHIFT_CREATE";
    AuditAction["SHIFT_UPDATE"] = "SHIFT_UPDATE";
    AuditAction["SHIFT_DELETE"] = "SHIFT_DELETE";
    AuditAction["DEPARTMENT_CREATE"] = "DEPARTMENT_CREATE";
    AuditAction["DEPARTMENT_UPDATE"] = "DEPARTMENT_UPDATE";
    AuditAction["DEPARTMENT_DELETE"] = "DEPARTMENT_DELETE";
    AuditAction["REPORT_GENERATE"] = "REPORT_GENERATE";
    AuditAction["REPORT_PRINT"] = "REPORT_PRINT";
})(AuditAction || (exports.AuditAction = AuditAction = {}));
let AuditLog = class AuditLog {
};
exports.AuditLog = AuditLog;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], AuditLog.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], AuditLog.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], AuditLog.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: AuditAction,
    }),
    __metadata("design:type", String)
], AuditLog.prototype, "action", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", Object)
], AuditLog.prototype, "entityType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], AuditLog.prototype, "entityId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], AuditLog.prototype, "oldValues", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], AuditLog.prototype, "newValues", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 500, nullable: true }),
    __metadata("design:type", Object)
], AuditLog.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 45, nullable: true }),
    __metadata("design:type", Object)
], AuditLog.prototype, "ipAddress", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 500, nullable: true }),
    __metadata("design:type", Object)
], AuditLog.prototype, "userAgent", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], AuditLog.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'userId' }),
    __metadata("design:type", Object)
], AuditLog.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => lab_entity_1.Lab, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'labId' }),
    __metadata("design:type", Object)
], AuditLog.prototype, "lab", void 0);
exports.AuditLog = AuditLog = __decorate([
    (0, typeorm_1.Entity)('audit_logs'),
    (0, typeorm_1.Index)(['labId', 'createdAt']),
    (0, typeorm_1.Index)(['userId', 'createdAt']),
    (0, typeorm_1.Index)(['action', 'createdAt']),
    (0, typeorm_1.Index)(['entityType', 'entityId'])
], AuditLog);
//# sourceMappingURL=audit-log.entity.js.map