"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubLabsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const sub_labs_controller_1 = require("./sub-labs.controller");
const sub_labs_service_1 = require("./sub-labs.service");
const sub_lab_entity_1 = require("../entities/sub-lab.entity");
const sub_lab_test_price_entity_1 = require("../entities/sub-lab-test-price.entity");
const user_entity_1 = require("../entities/user.entity");
const test_entity_1 = require("../entities/test.entity");
const order_entity_1 = require("../entities/order.entity");
const orders_module_1 = require("../orders/orders.module");
const reports_module_1 = require("../reports/reports.module");
const dashboard_module_1 = require("../dashboard/dashboard.module");
const auth_module_1 = require("../auth/auth.module");
let SubLabsModule = class SubLabsModule {
};
exports.SubLabsModule = SubLabsModule;
exports.SubLabsModule = SubLabsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([sub_lab_entity_1.SubLab, sub_lab_test_price_entity_1.SubLabTestPrice, user_entity_1.User, test_entity_1.Test, order_entity_1.Order]),
            orders_module_1.OrdersModule,
            reports_module_1.ReportsModule,
            dashboard_module_1.DashboardModule,
            auth_module_1.AuthModule,
        ],
        controllers: [sub_labs_controller_1.SubLabsController],
        providers: [sub_labs_service_1.SubLabsService],
        exports: [sub_labs_service_1.SubLabsService],
    })
], SubLabsModule);
//# sourceMappingURL=sub-labs.module.js.map