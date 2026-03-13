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
var OrdersController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersController = void 0;
const common_1 = require("@nestjs/common");
const orders_service_1 = require("./orders.service");
const create_order_dto_1 = require("./dto/create-order.dto");
const update_payment_dto_1 = require("./dto/update-payment.dto");
const update_order_tests_dto_1 = require("./dto/update-order-tests.dto");
const update_order_discount_dto_1 = require("./dto/update-order-discount.dto");
const update_order_delivery_methods_dto_1 = require("./dto/update-order-delivery-methods.dto");
const update_order_notes_dto_1 = require("./dto/update-order-notes.dto");
const cancel_order_dto_1 = require("./dto/cancel-order.dto");
const create_order_response_dto_1 = require("./dto/create-order-response.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const lab_actor_context_1 = require("../types/lab-actor-context");
const lab_role_matrix_1 = require("../auth/lab-role-matrix");
let OrdersController = OrdersController_1 = class OrdersController {
    constructor(ordersService) {
        this.ordersService = ordersService;
        this.logger = new common_1.Logger(OrdersController_1.name);
    }
    async create(req, dto, view) {
        const requestStartedAt = process.hrtime.bigint();
        const selectedView = view ?? create_order_response_dto_1.CreateOrderView.SUMMARY;
        const labId = req.user?.labId;
        try {
            if (!labId) {
                throw new Error('Lab ID not found in token');
            }
            return await this.ordersService.create(labId, dto, selectedView);
        }
        finally {
            const durationMs = Number(process.hrtime.bigint() - requestStartedAt) / 1_000_000;
            this.logger.log(JSON.stringify({
                event: 'orders.create.request',
                view: selectedView,
                labId: labId ?? null,
                durationMs: Math.round(durationMs * 100) / 100,
            }));
        }
    }
    async findAll(req, page, size, search, status, patientId, shiftId, startDate, endDate) {
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
            shiftId,
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
    async findHistory(req, page, size, search, status, patientId, shiftId, startDate, endDate, resultStatus) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.ordersService.findHistory(labId, {
            page: page ? parseInt(page, 10) : undefined,
            size: size ? parseInt(size, 10) : undefined,
            search,
            status: status,
            patientId,
            shiftId,
            startDate,
            endDate,
            resultStatus,
        });
    }
    async findOne(req, id, view) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.ordersService.findOne(id, labId, view ?? create_order_response_dto_1.OrderDetailView.COMPACT);
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
    async updateDiscount(req, id, dto) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.ordersService.updateDiscount(id, labId, dto.discountPercent);
    }
    async updateOrderNotes(req, id, dto) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.ordersService.updateNotes(id, labId, dto.notes, actor);
    }
    async updateOrderTests(req, id, dto) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.ordersService.updateOrderTests(id, labId, dto.testIds, actor, req.user?.role, {
            forceRemoveVerified: dto.forceRemoveVerified,
            removalReason: dto.removalReason,
        });
    }
    async updateOrderDeliveryMethods(req, id, dto) {
        const labId = req.user?.labId;
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.ordersService.updateDeliveryMethods(id, labId, dto.deliveryMethods);
    }
    async cancelOrder(req, id, dto) {
        const labId = req.user?.labId;
        const actor = (0, lab_actor_context_1.buildLabActorContext)(req.user);
        if (!labId) {
            throw new Error('Lab ID not found in token');
        }
        return this.ordersService.cancelOrder(id, labId, actor, dto.reason);
    }
};
exports.OrdersController = OrdersController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ORDERS_WORKFLOW),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Query)('view', new common_1.ParseEnumPipe(create_order_response_dto_1.CreateOrderView, { optional: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_order_dto_1.CreateOrderDto, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ORDERS_WORKFLOW),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('size')),
    __param(3, (0, common_1.Query)('search')),
    __param(4, (0, common_1.Query)('status')),
    __param(5, (0, common_1.Query)('patientId')),
    __param(6, (0, common_1.Query)('shiftId')),
    __param(7, (0, common_1.Query)('startDate')),
    __param(8, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('estimate-price'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ORDERS_WORKFLOW),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('testIds')),
    __param(2, (0, common_1.Query)('shiftId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "estimatePrice", null);
__decorate([
    (0, common_1.Get)('today-patients'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ORDERS_WORKFLOW),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "getTodayPatients", null);
__decorate([
    (0, common_1.Get)('next-order-number'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ORDERS_WORKFLOW),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('shiftId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "getNextOrderNumber", null);
__decorate([
    (0, common_1.Get)('worklist'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ORDERS_WORKFLOW),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('shiftId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "getWorklist", null);
__decorate([
    (0, common_1.Post)('worklist'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ORDERS_WORKFLOW),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "saveWorklist", null);
__decorate([
    (0, common_1.Get)('history'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ORDERS_HISTORY_READ),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('size')),
    __param(3, (0, common_1.Query)('search')),
    __param(4, (0, common_1.Query)('status')),
    __param(5, (0, common_1.Query)('patientId')),
    __param(6, (0, common_1.Query)('shiftId')),
    __param(7, (0, common_1.Query)('startDate')),
    __param(8, (0, common_1.Query)('endDate')),
    __param(9, (0, common_1.Query)('resultStatus', new common_1.ParseEnumPipe(create_order_response_dto_1.OrderResultStatus, { optional: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "findHistory", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ORDERS_HISTORY_READ),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Query)('view', new common_1.ParseEnumPipe(create_order_response_dto_1.OrderDetailView, { optional: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id/payment'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ORDERS_WORKFLOW),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_payment_dto_1.UpdateOrderPaymentDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "updatePayment", null);
__decorate([
    (0, common_1.Patch)(':id/discount'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ORDERS_WORKFLOW),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_order_discount_dto_1.UpdateOrderDiscountDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "updateDiscount", null);
__decorate([
    (0, common_1.Patch)(':id/notes'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ORDERS_WORKFLOW),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_order_notes_dto_1.UpdateOrderNotesDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "updateOrderNotes", null);
__decorate([
    (0, common_1.Patch)(':id/tests'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ORDERS_WORKFLOW),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_order_tests_dto_1.UpdateOrderTestsDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "updateOrderTests", null);
__decorate([
    (0, common_1.Patch)(':id/delivery-methods'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ORDERS_WORKFLOW),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_order_delivery_methods_dto_1.UpdateOrderDeliveryMethodsDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "updateOrderDeliveryMethods", null);
__decorate([
    (0, common_1.Patch)(':id/cancel'),
    (0, roles_decorator_1.Roles)(...lab_role_matrix_1.LAB_ROLE_GROUPS.ORDERS_WORKFLOW),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, cancel_order_dto_1.CancelOrderDto]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "cancelOrder", null);
exports.OrdersController = OrdersController = OrdersController_1 = __decorate([
    (0, common_1.Controller)('orders'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [orders_service_1.OrdersService])
], OrdersController);
//# sourceMappingURL=orders.controller.js.map