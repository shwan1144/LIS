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
exports.SubLab = void 0;
const typeorm_1 = require("typeorm");
const lab_entity_1 = require("./lab.entity");
const user_entity_1 = require("./user.entity");
const sub_lab_test_price_entity_1 = require("./sub-lab-test-price.entity");
const order_entity_1 = require("./order.entity");
let SubLab = class SubLab {
};
exports.SubLab = SubLab;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], SubLab.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], SubLab.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], SubLab.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], SubLab.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], SubLab.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], SubLab.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => lab_entity_1.Lab, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'labId' }),
    __metadata("design:type", lab_entity_1.Lab)
], SubLab.prototype, "lab", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => user_entity_1.User, (user) => user.subLab),
    __metadata("design:type", Array)
], SubLab.prototype, "users", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => sub_lab_test_price_entity_1.SubLabTestPrice, (price) => price.subLab),
    __metadata("design:type", Array)
], SubLab.prototype, "testPrices", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => order_entity_1.Order, (order) => order.sourceSubLab),
    __metadata("design:type", Array)
], SubLab.prototype, "orders", void 0);
exports.SubLab = SubLab = __decorate([
    (0, typeorm_1.Entity)('sub_labs'),
    (0, typeorm_1.Index)('IDX_sub_labs_lab_name', ['labId', 'name'])
], SubLab);
//# sourceMappingURL=sub-lab.entity.js.map