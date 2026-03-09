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
exports.GatewayJwtStrategy = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const passport_jwt_1 = require("passport-jwt");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const security_env_1 = require("../config/security-env");
const gateway_entity_1 = require("../entities/gateway.entity");
const gatewayJwtSecret = (0, security_env_1.requireSecret)('JWT_SECRET', 'lis-dev-secret-change-in-production', 'GatewayJwtStrategy');
let GatewayJwtStrategy = class GatewayJwtStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy, 'gateway-jwt') {
    constructor(gatewayRepo) {
        super({
            jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: gatewayJwtSecret,
        });
        this.gatewayRepo = gatewayRepo;
    }
    async validate(payload) {
        if (payload.tokenType !== 'gateway_access') {
            throw new common_1.UnauthorizedException('Invalid gateway token type');
        }
        const gateway = await this.gatewayRepo.findOne({
            where: { id: payload.sub },
        });
        if (!gateway || gateway.status === gateway_entity_1.GatewayDeviceStatus.DISABLED) {
            throw new common_1.UnauthorizedException('Gateway not allowed');
        }
        if (payload.labId !== gateway.labId) {
            throw new common_1.UnauthorizedException('Gateway lab mismatch');
        }
        return {
            gatewayId: gateway.id,
            labId: gateway.labId,
            scope: Array.isArray(payload.scope) ? payload.scope : [],
        };
    }
};
exports.GatewayJwtStrategy = GatewayJwtStrategy;
exports.GatewayJwtStrategy = GatewayJwtStrategy = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(gateway_entity_1.GatewayDevice)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], GatewayJwtStrategy);
//# sourceMappingURL=gateway-jwt.strategy.js.map