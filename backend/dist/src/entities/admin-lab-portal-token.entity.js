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
exports.AdminLabPortalToken = void 0;
const typeorm_1 = require("typeorm");
let AdminLabPortalToken = class AdminLabPortalToken {
};
exports.AdminLabPortalToken = AdminLabPortalToken;
__decorate([
    (0, typeorm_1.PrimaryColumn)('uuid'),
    __metadata("design:type", String)
], AdminLabPortalToken.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], AdminLabPortalToken.prototype, "platformUserId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], AdminLabPortalToken.prototype, "labId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], AdminLabPortalToken.prototype, "tokenHash", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], AdminLabPortalToken.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], AdminLabPortalToken.prototype, "usedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 45, nullable: true }),
    __metadata("design:type", Object)
], AdminLabPortalToken.prototype, "createdIp", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 500, nullable: true }),
    __metadata("design:type", Object)
], AdminLabPortalToken.prototype, "createdUserAgent", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 45, nullable: true }),
    __metadata("design:type", Object)
], AdminLabPortalToken.prototype, "usedIp", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 500, nullable: true }),
    __metadata("design:type", Object)
], AdminLabPortalToken.prototype, "usedUserAgent", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], AdminLabPortalToken.prototype, "createdAt", void 0);
exports.AdminLabPortalToken = AdminLabPortalToken = __decorate([
    (0, typeorm_1.Entity)('admin_lab_portal_tokens'),
    (0, typeorm_1.Index)(['platformUserId', 'createdAt']),
    (0, typeorm_1.Index)(['labId', 'createdAt']),
    (0, typeorm_1.Index)(['expiresAt']),
    (0, typeorm_1.Index)(['usedAt'])
], AdminLabPortalToken);
//# sourceMappingURL=admin-lab-portal-token.entity.js.map