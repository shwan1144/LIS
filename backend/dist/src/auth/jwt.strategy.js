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
exports.JwtStrategy = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const passport_jwt_1 = require("passport-jwt");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../entities/user.entity");
const platform_user_entity_1 = require("../entities/platform-user.entity");
let JwtStrategy = class JwtStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy, 'lab-jwt') {
    constructor(userRepository, platformUserRepository) {
        super({
            jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET || 'lis-dev-secret-change-in-production',
            passReqToCallback: true,
        });
        this.userRepository = userRepository;
        this.platformUserRepository = platformUserRepository;
    }
    async validate(req, payload) {
        if (payload.tokenType === 'lab_impersonation_access') {
            const platformUserId = payload.platformUserId?.trim() || payload.sub;
            const platformUser = await this.platformUserRepository.findOne({
                where: { id: platformUserId, isActive: true },
            });
            if (!platformUser) {
                throw new common_1.UnauthorizedException();
            }
            if (req.labId && payload.labId !== req.labId) {
                throw new common_1.UnauthorizedException('Invalid token for subdomain lab');
            }
            return {
                userId: null,
                username: platformUser.email,
                labId: payload.labId,
                role: 'SUPER_ADMIN',
                isImpersonation: true,
                platformUserId: platformUser.id,
            };
        }
        const user = await this.userRepository.findOne({
            where: { id: payload.sub, isActive: true },
        });
        if (!user) {
            throw new common_1.UnauthorizedException();
        }
        if (user.labId && payload.labId !== user.labId) {
            throw new common_1.UnauthorizedException('Token lab mismatch');
        }
        if (req.labId && payload.labId !== req.labId) {
            throw new common_1.UnauthorizedException('Invalid token for subdomain lab');
        }
        return {
            userId: payload.sub,
            username: payload.username,
            labId: payload.labId,
            role: user.role,
        };
    }
};
exports.JwtStrategy = JwtStrategy;
exports.JwtStrategy = JwtStrategy = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(platform_user_entity_1.PlatformUser)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], JwtStrategy);
//# sourceMappingURL=jwt.strategy.js.map