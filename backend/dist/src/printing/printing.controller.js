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
exports.PrintingController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const qz_signing_service_1 = require("./qz-signing.service");
let PrintingController = class PrintingController {
    constructor(qzSigningService) {
        this.qzSigningService = qzSigningService;
    }
    getCertificate() {
        return {
            certificate: this.qzSigningService.getCertificate(),
            algorithm: this.qzSigningService.getSignatureAlgorithm(),
        };
    }
    signPayload(body) {
        if (typeof body?.payload !== 'string' || body.payload.trim().length === 0) {
            throw new common_1.BadRequestException('payload is required');
        }
        return {
            signature: this.qzSigningService.signPayload(body.payload),
            algorithm: this.qzSigningService.getSignatureAlgorithm(),
        };
    }
};
exports.PrintingController = PrintingController;
__decorate([
    (0, common_1.Get)('certificate'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PrintingController.prototype, "getCertificate", null);
__decorate([
    (0, common_1.Post)('sign'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PrintingController.prototype, "signPayload", null);
exports.PrintingController = PrintingController = __decorate([
    (0, common_1.Controller)('printing/qz'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [qz_signing_service_1.QzSigningService])
], PrintingController);
//# sourceMappingURL=printing.controller.js.map