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
exports.LabOrdersWorklist = void 0;
const typeorm_1 = require("typeorm");
let LabOrdersWorklist = class LabOrdersWorklist {
};
exports.LabOrdersWorklist = LabOrdersWorklist;
__decorate([
    (0, typeorm_1.PrimaryColumn)('uuid'),
    __metadata("design:type", String)
], LabOrdersWorklist.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'varchar', length: 64, default: '' }),
    __metadata("design:type", String)
], LabOrdersWorklist.prototype, "shiftId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], LabOrdersWorklist.prototype, "itemsJson", void 0);
exports.LabOrdersWorklist = LabOrdersWorklist = __decorate([
    (0, typeorm_1.Entity)('lab_orders_worklist')
], LabOrdersWorklist);
//# sourceMappingURL=lab-orders-worklist.entity.js.map