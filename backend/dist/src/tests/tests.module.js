"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const test_entity_1 = require("../entities/test.entity");
const pricing_entity_1 = require("../entities/pricing.entity");
const test_component_entity_1 = require("../entities/test-component.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const department_entity_1 = require("../entities/department.entity");
const tests_service_1 = require("./tests.service");
const tests_controller_1 = require("./tests.controller");
let TestsModule = class TestsModule {
};
exports.TestsModule = TestsModule;
exports.TestsModule = TestsModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([test_entity_1.Test, pricing_entity_1.Pricing, test_component_entity_1.TestComponent, order_test_entity_1.OrderTest, department_entity_1.Department])],
        controllers: [tests_controller_1.TestsController],
        providers: [tests_service_1.TestsService],
        exports: [tests_service_1.TestsService],
    })
], TestsModule);
//# sourceMappingURL=tests.module.js.map