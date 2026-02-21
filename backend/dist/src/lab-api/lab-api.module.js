"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LabApiModule = void 0;
const common_1 = require("@nestjs/common");
const audit_module_1 = require("../audit/audit.module");
const database_support_module_1 = require("../database/database-support.module");
const lab_api_controller_1 = require("./lab-api.controller");
const lab_api_service_1 = require("./lab-api.service");
let LabApiModule = class LabApiModule {
};
exports.LabApiModule = LabApiModule;
exports.LabApiModule = LabApiModule = __decorate([
    (0, common_1.Module)({
        imports: [database_support_module_1.DatabaseSupportModule, audit_module_1.AuditModule],
        controllers: [lab_api_controller_1.LabApiController],
        providers: [lab_api_service_1.LabApiService],
    })
], LabApiModule);
//# sourceMappingURL=lab-api.module.js.map