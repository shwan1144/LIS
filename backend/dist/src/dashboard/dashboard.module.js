"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const patient_entity_1 = require("../entities/patient.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const order_entity_1 = require("../entities/order.entity");
const lab_entity_1 = require("../entities/lab.entity");
const shift_entity_1 = require("../entities/shift.entity");
const department_entity_1 = require("../entities/department.entity");
const dashboard_service_1 = require("./dashboard.service");
const dashboard_controller_1 = require("./dashboard.controller");
const orders_module_1 = require("../orders/orders.module");
const unmatched_module_1 = require("../unmatched/unmatched.module");
const auth_module_1 = require("../auth/auth.module");
let DashboardModule = class DashboardModule {
};
exports.DashboardModule = DashboardModule;
exports.DashboardModule = DashboardModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([patient_entity_1.Patient, order_test_entity_1.OrderTest, order_entity_1.Order, lab_entity_1.Lab, shift_entity_1.Shift, department_entity_1.Department]),
            orders_module_1.OrdersModule,
            unmatched_module_1.UnmatchedModule,
            auth_module_1.AuthModule,
        ],
        controllers: [dashboard_controller_1.DashboardController],
        providers: [dashboard_service_1.DashboardService],
        exports: [dashboard_service_1.DashboardService],
    })
], DashboardModule);
//# sourceMappingURL=dashboard.module.js.map