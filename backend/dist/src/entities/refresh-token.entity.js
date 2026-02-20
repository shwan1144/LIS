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
exports.RefreshToken = exports.RefreshTokenActorType = void 0;
const typeorm_1 = require("typeorm");
var RefreshTokenActorType;
(function (RefreshTokenActorType) {
    RefreshTokenActorType["LAB_USER"] = "LAB_USER";
    RefreshTokenActorType["PLATFORM_USER"] = "PLATFORM_USER";
})(RefreshTokenActorType || (exports.RefreshTokenActorType = RefreshTokenActorType = {}));
let RefreshToken = class RefreshToken {
};
exports.RefreshToken = RefreshToken;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'uuid' }),
    __metadata("design:type", String)
], RefreshToken.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: RefreshTokenActorType,
    }),
    __metadata("design:type", String)
], RefreshToken.prototype, "actorType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], RefreshToken.prototype, "actorId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], RefreshToken.prototype, "familyId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], RefreshToken.prototype, "tokenHash", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp' }),
    __metadata("design:type", Date)
], RefreshToken.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], RefreshToken.prototype, "revokedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], RefreshToken.prototype, "replacedByTokenId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], RefreshToken.prototype, "context", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 45, nullable: true }),
    __metadata("design:type", Object)
], RefreshToken.prototype, "createdIp", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 500, nullable: true }),
    __metadata("design:type", Object)
], RefreshToken.prototype, "createdUserAgent", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], RefreshToken.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], RefreshToken.prototype, "updatedAt", void 0);
exports.RefreshToken = RefreshToken = __decorate([
    (0, typeorm_1.Entity)('refresh_tokens'),
    (0, typeorm_1.Index)(['actorType', 'actorId']),
    (0, typeorm_1.Index)(['familyId'])
], RefreshToken);
//# sourceMappingURL=refresh-token.entity.js.map