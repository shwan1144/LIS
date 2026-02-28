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
exports.PlatformUser = exports.PlatformUserRole = void 0;
const typeorm_1 = require("typeorm");
var PlatformUserRole;
(function (PlatformUserRole) {
    PlatformUserRole["SUPER_ADMIN"] = "SUPER_ADMIN";
    PlatformUserRole["AUDITOR"] = "AUDITOR";
})(PlatformUserRole || (exports.PlatformUserRole = PlatformUserRole = {}));
let PlatformUser = class PlatformUser {
};
exports.PlatformUser = PlatformUser;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], PlatformUser.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], PlatformUser.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], PlatformUser.prototype, "passwordHash", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: PlatformUserRole,
        default: PlatformUserRole.AUDITOR,
    }),
    __metadata("design:type", String)
], PlatformUser.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], PlatformUser.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], PlatformUser.prototype, "mfaSecret", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], PlatformUser.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], PlatformUser.prototype, "updatedAt", void 0);
exports.PlatformUser = PlatformUser = __decorate([
    (0, typeorm_1.Entity)('platform_users'),
    (0, typeorm_1.Index)(['email'], { unique: true })
], PlatformUser);
//# sourceMappingURL=platform-user.entity.js.map