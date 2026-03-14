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
var CalculationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalculationService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const order_test_entity_1 = require("../entities/order-test.entity");
const patient_age_util_1 = require("../patients/patient-age.util");
let CalculationService = CalculationService_1 = class CalculationService {
    constructor(orderTestRepo) {
        this.orderTestRepo = orderTestRepo;
        this.logger = new common_1.Logger(CalculationService_1.name);
    }
    async processOrderCalculations(orderId, labId, actorId) {
        const allTests = await this.orderTestRepo.find({
            where: { sample: { orderId: orderId } },
            relations: ['test', 'sample', 'sample.order', 'sample.order.patient'],
        });
        if (!allTests.length)
            return;
        const testMap = new Map(allTests.map((ot) => [ot.test.code.toUpperCase(), ot]));
        const toUpdate = [];
        this.calculateVLDL(testMap, toUpdate);
        this.calculateHOMA(testMap, toUpdate);
        this.calculateTSAT(testMap, toUpdate);
        this.calculateEGFR(testMap, toUpdate);
        if (toUpdate.length > 0) {
            for (const ot of toUpdate) {
                ot.status = order_test_entity_1.OrderTestStatus.COMPLETED;
                ot.resultedAt = new Date();
                ot.resultedBy = actorId || ot.resultedBy;
            }
            await this.orderTestRepo.save(toUpdate);
            this.logger.log(`Automatically calculated ${toUpdate.length} tests for order ${orderId}`);
        }
    }
    calculateVLDL(testMap, toUpdate) {
        const vldl = testMap.get('VLDL');
        const trig = testMap.get('TRIG');
        if (vldl && trig && trig.resultValue !== null && trig.resultValue !== undefined) {
            const calculatedValue = parseFloat((trig.resultValue / 5).toFixed(2));
            if (vldl.resultValue !== calculatedValue) {
                vldl.resultValue = calculatedValue;
                vldl.resultText = calculatedValue.toString();
                toUpdate.push(vldl);
            }
        }
    }
    calculateHOMA(testMap, toUpdate) {
        const homa = testMap.get('HOMA') || testMap.get('HOMA-IR');
        const glu = testMap.get('GLU') || testMap.get('GLUCOSE');
        const insulin = testMap.get('INSULIN');
        if (homa &&
            glu &&
            insulin &&
            glu.resultValue !== null &&
            glu.resultValue !== undefined &&
            insulin.resultValue !== null &&
            insulin.resultValue !== undefined) {
            const calculatedValue = parseFloat(((glu.resultValue * insulin.resultValue) / 405).toFixed(2));
            if (homa.resultValue !== calculatedValue) {
                homa.resultValue = calculatedValue;
                homa.resultText = calculatedValue.toString();
                toUpdate.push(homa);
            }
        }
    }
    calculateTSAT(testMap, toUpdate) {
        const tsat = testMap.get('TSAT');
        const iron = testMap.get('IRON');
        const tibc = testMap.get('TIBC');
        if (tsat &&
            iron &&
            tibc &&
            iron.resultValue !== null &&
            iron.resultValue !== undefined &&
            tibc.resultValue !== null &&
            tibc.resultValue !== undefined &&
            tibc.resultValue !== 0) {
            const calculatedValue = parseFloat(((iron.resultValue / tibc.resultValue) * 100).toFixed(1));
            if (tsat.resultValue !== calculatedValue) {
                tsat.resultValue = calculatedValue;
                tsat.resultText = calculatedValue.toString();
                toUpdate.push(tsat);
            }
        }
    }
    calculateEGFR(testMap, toUpdate) {
        const egfr = testMap.get('EGFR') || testMap.get('EGFR-CKD');
        const creat = testMap.get('CREAT') || testMap.get('CREATININE');
        if (egfr && creat && creat.resultValue !== null && creat.resultValue !== undefined) {
            const order = creat.sample?.order;
            const patient = order?.patient;
            const age = (0, patient_age_util_1.getPatientAgeYears)(patient?.dateOfBirth, order?.registeredAt) || 0;
            const sex = patient?.sex?.toUpperCase() || 'M';
            if (age < 18)
                return;
            const kappa = sex === 'F' ? 0.7 : 0.9;
            const alpha = sex === 'F' ? -0.241 : -0.302;
            const sexConstant = sex === 'F' ? 1.012 : 1.0;
            const scr = creat.resultValue;
            const gfr = 142 *
                Math.pow(Math.min(scr / kappa, 1), alpha) *
                Math.pow(Math.max(scr / kappa, 1), -1.2) *
                Math.pow(0.9938, age) *
                sexConstant;
            const calculatedValue = parseFloat(gfr.toFixed(0));
            if (egfr.resultValue !== calculatedValue) {
                egfr.resultValue = calculatedValue;
                egfr.resultText = calculatedValue >= 90 ? '>90' : calculatedValue.toString();
                toUpdate.push(egfr);
            }
        }
    }
};
exports.CalculationService = CalculationService;
exports.CalculationService = CalculationService = CalculationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(order_test_entity_1.OrderTest)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], CalculationService);
//# sourceMappingURL=calculation.service.js.map