"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const settings_service_1 = require("./settings.service");
const settings_controller_1 = require("./settings.controller");
const auth_module_1 = require("../auth/auth.module");
const user_entity_1 = require("../entities/user.entity");
const user_lab_assignment_entity_1 = require("../entities/user-lab-assignment.entity");
const user_shift_assignment_entity_1 = require("../entities/user-shift-assignment.entity");
const user_department_assignment_entity_1 = require("../entities/user-department-assignment.entity");
const department_entity_1 = require("../entities/department.entity");
const lab_entity_1 = require("../entities/lab.entity");
const shift_entity_1 = require("../entities/shift.entity");
let SettingsModule = class SettingsModule {
};
exports.SettingsModule = SettingsModule;
exports.SettingsModule = SettingsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            auth_module_1.AuthModule,
            typeorm_1.TypeOrmModule.forFeature([
                user_entity_1.User,
                user_lab_assignment_entity_1.UserLabAssignment,
                user_shift_assignment_entity_1.UserShiftAssignment,
                user_department_assignment_entity_1.UserDepartmentAssignment,
                department_entity_1.Department,
                lab_entity_1.Lab,
                shift_entity_1.Shift,
            ]),
        ],
        providers: [settings_service_1.SettingsService],
        controllers: [settings_controller_1.SettingsController],
        exports: [settings_service_1.SettingsService],
    })
], SettingsModule);
//# sourceMappingURL=settings.module.js.map