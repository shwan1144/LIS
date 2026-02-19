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
exports.UnmatchedResultsController = void 0;
const common_1 = require("@nestjs/common");
const unmatched_results_service_1 = require("./unmatched-results.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let UnmatchedResultsController = class UnmatchedResultsController {
    constructor(unmatchedService) {
        this.unmatchedService = unmatchedService;
    }
    async findAll(req, status, instrumentId, reason, page, size) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        return this.unmatchedService.findAll(labId, {
            status,
            instrumentId,
            reason: reason,
            page: page ? parseInt(page, 10) : undefined,
            size: size ? parseInt(size, 10) : undefined,
        });
    }
    async getStats(req) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        return this.unmatchedService.getStats(labId);
    }
    async findOne(req, id) {
        const labId = req.user?.labId;
        if (!labId)
            throw new Error('Lab ID not found');
        return this.unmatchedService.findOne(id, labId);
    }
    async resolve(req, id, dto) {
        const labId = req.user?.labId;
        const userId = req.user?.userId;
        if (!labId || !userId)
            throw new Error('Lab ID or User ID not found');
        return this.unmatchedService.resolve(id, labId, userId, dto);
    }
};
exports.UnmatchedResultsController = UnmatchedResultsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('instrumentId')),
    __param(3, (0, common_1.Query)('reason')),
    __param(4, (0, common_1.Query)('page')),
    __param(5, (0, common_1.Query)('size')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], UnmatchedResultsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('stats'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UnmatchedResultsController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], UnmatchedResultsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(':id/resolve'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], UnmatchedResultsController.prototype, "resolve", null);
exports.UnmatchedResultsController = UnmatchedResultsController = __decorate([
    (0, common_1.Controller)('unmatched-results'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [unmatched_results_service_1.UnmatchedResultsService])
], UnmatchedResultsController);
//# sourceMappingURL=unmatched-results.controller.js.map