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
exports.OrdersController = void 0;
const common_1 = require("@nestjs/common");
const orders_service_1 = require("./orders.service");
const create_order_dto_1 = require("./dto/create-order.dto");
const update_payment_dto_1 = require("./dto/update-payment.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let OrdersController = class OrdersController {
    constructor(ordersService) {
        this.ordersService = ordersService;
    }
    async create(req, dto) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.ordersService.create(labId, dto);
    }
    async findAll(req, page, size, search, status, patientId, startDate, endDate) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.ordersService.findAll(labId, {
            page: page ? parseInt(page, 10) : undefined,
            size: size ? parseInt(size, 10) : undefined,
            search,
            status: status,
            patientId,
            startDate,
            endDate,
        });
    }
    async estimatePrice(req, testIds, shiftId) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        const ids = testIds ? testIds.split(',').filter(Boolean) : [];
        return this.ordersService.estimatePrice(labId, ids, shiftId || null);
    }
    async getTodayPatients(req) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.ordersService.getTodayPatients(labId);
    }
    async getNextOrderNumber(req, shiftId) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        const next = await this.ordersService.getNextOrderNumber(labId, shiftId ?? null);
        return { orderNumber: next };
    }
    async getWorklist(req, shiftId) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.ordersService.getWorklist(labId, shiftId ?? null);
    }
    async saveWorklist(req, body) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        const items = Array.isArray(body?.items) ? body.items : [];
        await this.ordersService.saveWorklist(labId, body.shiftId ?? null, items);
        return { ok: true };
    }
    async findOne(req, id) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.ordersService.findOne(id, labId);
    }
    async updatePayment(req, id, dto) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.ordersService.updatePayment(id, labId, {
            paymentStatus: dto.paymentStatus,
            paidAmount: dto.paidAmount,
        });
    }
};
exports.OrdersController = OrdersController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_order_dto_1.CreateOrderDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('size')),
    __param(3, (0, common_1.Query)('search')),
    __param(4, (0, common_1.Query)('status')),
    __param(5, (0, common_1.Query)('patientId')),
    __param(6, (0, common_1.Query)('startDate')),
    __param(7, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('estimate-price'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('testIds')),
    __param(2, (0, common_1.Query)('shiftId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "estimatePrice", null);
__decorate([
    (0, common_1.Get)('today-patients'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "getTodayPatients", null);
__decorate([
    (0, common_1.Get)('next-order-number'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('shiftId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "getNextOrderNumber", null);
__decorate([
    (0, common_1.Get)('worklist'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('shiftId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "getWorklist", null);
__decorate([
    (0, common_1.Post)('worklist'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "saveWorklist", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id/payment'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_payment_dto_1.UpdateOrderPaymentDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "updatePayment", null);
exports.OrdersController = OrdersController = __decorate([
    (0, common_1.Controller)('orders'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [orders_service_1.OrdersService])
], OrdersController);
//# sourceMappingURL=orders.controller.js.map