"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorklistModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const worklist_service_1 = require("./worklist.service");
const worklist_controller_1 = require("./worklist.controller");
const order_test_entity_1 = require("../entities/order-test.entity");
const order_entity_1 = require("../entities/order.entity");
const test_entity_1 = require("../entities/test.entity");
const user_department_assignment_entity_1 = require("../entities/user-department-assignment.entity");
const department_entity_1 = require("../entities/department.entity");
const panels_module_1 = require("../panels/panels.module");
let WorklistModule = class WorklistModule {
};
exports.WorklistModule = WorklistModule;
exports.WorklistModule = WorklistModule = __decorate([
    (0, common_1.Module)({
        imports: [
            panels_module_1.PanelsModule,
            typeorm_1.TypeOrmModule.forFeature([
                order_test_entity_1.OrderTest,
                order_entity_1.Order,
                test_entity_1.Test,
                user_department_assignment_entity_1.UserDepartmentAssignment,
                department_entity_1.Department,
            ]),
        ],
        providers: [worklist_service_1.WorklistService],
        controllers: [worklist_controller_1.WorklistController],
        exports: [worklist_service_1.WorklistService],
    })
], WorklistModule);
//# sourceMappingURL=worklist.module.js.map