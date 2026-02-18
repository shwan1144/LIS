"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const order_entity_1 = require("../entities/order.entity");
const sample_entity_1 = require("../entities/sample.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const patient_entity_1 = require("../entities/patient.entity");
const lab_entity_1 = require("../entities/lab.entity");
const shift_entity_1 = require("../entities/shift.entity");
const test_entity_1 = require("../entities/test.entity");
const pricing_entity_1 = require("../entities/pricing.entity");
const test_component_entity_1 = require("../entities/test-component.entity");
const lab_orders_worklist_entity_1 = require("../entities/lab-orders-worklist.entity");
const orders_service_1 = require("./orders.service");
const orders_controller_1 = require("./orders.controller");
let OrdersModule = class OrdersModule {
};
exports.OrdersModule = OrdersModule;
exports.OrdersModule = OrdersModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                order_entity_1.Order,
                sample_entity_1.Sample,
                order_test_entity_1.OrderTest,
                patient_entity_1.Patient,
                lab_entity_1.Lab,
                shift_entity_1.Shift,
                test_entity_1.Test,
                pricing_entity_1.Pricing,
                test_component_entity_1.TestComponent,
                lab_orders_worklist_entity_1.LabOrdersWorklist,
            ]),
        ],
        controllers: [orders_controller_1.OrdersController],
        providers: [orders_service_1.OrdersService],
        exports: [orders_service_1.OrdersService],
    })
], OrdersModule);
//# sourceMappingURL=orders.module.js.map