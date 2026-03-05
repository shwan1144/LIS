"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnmatchedModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const unmatched_instrument_result_entity_1 = require("../entities/unmatched-instrument-result.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const unmatched_results_service_1 = require("./unmatched-results.service");
const unmatched_results_controller_1 = require("./unmatched-results.controller");
const panels_module_1 = require("../panels/panels.module");
let UnmatchedModule = class UnmatchedModule {
};
exports.UnmatchedModule = UnmatchedModule;
exports.UnmatchedModule = UnmatchedModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([unmatched_instrument_result_entity_1.UnmatchedInstrumentResult, order_test_entity_1.OrderTest]),
            panels_module_1.PanelsModule,
        ],
        controllers: [unmatched_results_controller_1.UnmatchedResultsController],
        providers: [unmatched_results_service_1.UnmatchedResultsService],
        exports: [unmatched_results_service_1.UnmatchedResultsService],
    })
], UnmatchedModule);
//# sourceMappingURL=unmatched.module.js.map