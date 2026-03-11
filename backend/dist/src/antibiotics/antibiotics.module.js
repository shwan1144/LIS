"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AntibioticsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const antibiotic_entity_1 = require("../entities/antibiotic.entity");
const antibiotics_controller_1 = require("./antibiotics.controller");
const antibiotics_service_1 = require("./antibiotics.service");
let AntibioticsModule = class AntibioticsModule {
};
exports.AntibioticsModule = AntibioticsModule;
exports.AntibioticsModule = AntibioticsModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([antibiotic_entity_1.Antibiotic])],
        controllers: [antibiotics_controller_1.AntibioticsController],
        providers: [antibiotics_service_1.AntibioticsService],
        exports: [antibiotics_service_1.AntibioticsService],
    })
], AntibioticsModule);
//# sourceMappingURL=antibiotics.module.js.map