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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminJwtStrategy = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const passport_jwt_1 = require("passport-jwt");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const platform_user_entity_1 = require("../entities/platform-user.entity");
let AdminJwtStrategy = class AdminJwtStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy, 'platform-jwt') {
    constructor(platformUserRepo) {
        super({
            jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.PLATFORM_JWT_SECRET || process.env.JWT_SECRET || 'platform-dev-secret',
        });
        this.platformUserRepo = platformUserRepo;
    }
    async validate(payload) {
        const platformUser = await this.platformUserRepo.findOne({
            where: { id: payload.sub, isActive: true },
        });
        if (!platformUser) {
            throw new common_1.UnauthorizedException();
        }
        return {
            platformUserId: platformUser.id,
            email: platformUser.email,
            role: platformUser.role,
            impersonatedLabId: payload.impersonatedLabId ?? null,
            impersonationStartedAt: payload.impersonationStartedAt ?? null,
        };
    }
};
exports.AdminJwtStrategy = AdminJwtStrategy;
exports.AdminJwtStrategy = AdminJwtStrategy = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(platform_user_entity_1.PlatformUser)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AdminJwtStrategy);
//# sourceMappingURL=admin-jwt.strategy.js.map