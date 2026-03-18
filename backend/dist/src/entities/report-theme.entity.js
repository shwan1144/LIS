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
exports.ReportTheme = void 0;
const typeorm_1 = require("typeorm");
const lab_entity_1 = require("./lab.entity");
let ReportTheme = class ReportTheme {
};
exports.ReportTheme = ReportTheme;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], ReportTheme.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], ReportTheme.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => lab_entity_1.Lab),
    (0, typeorm_1.JoinColumn)({ name: 'labId' }),
    __metadata("design:type", lab_entity_1.Lab)
], ReportTheme.prototype, "lab", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 128 }),
    __metadata("design:type", String)
], ReportTheme.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb' }),
    __metadata("design:type", Object)
], ReportTheme.prototype, "reportStyle", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb' }),
    __metadata("design:type", Object)
], ReportTheme.prototype, "reportBranding", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], ReportTheme.prototype, "onlineResultWatermarkDataUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 120, nullable: true }),
    __metadata("design:type", Object)
], ReportTheme.prototype, "onlineResultWatermarkText", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ReportTheme.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], ReportTheme.prototype, "updatedAt", void 0);
exports.ReportTheme = ReportTheme = __decorate([
    (0, typeorm_1.Entity)('report_themes')
], ReportTheme);
//# sourceMappingURL=report-theme.entity.js.map