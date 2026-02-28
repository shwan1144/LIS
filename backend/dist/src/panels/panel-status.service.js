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
var PanelStatusService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PanelStatusService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const order_test_entity_1 = require("../entities/order-test.entity");
const test_component_entity_1 = require("../entities/test-component.entity");
let PanelStatusService = PanelStatusService_1 = class PanelStatusService {
    constructor(orderTestRepo, testComponentRepo) {
        this.orderTestRepo = orderTestRepo;
        this.testComponentRepo = testComponentRepo;
        this.logger = new common_1.Logger(PanelStatusService_1.name);
    }
    async recomputePanelStatus(parentOrderTestId) {
        const parent = await this.orderTestRepo.findOne({
            where: { id: parentOrderTestId },
            relations: ['test', 'childOrderTests', 'childOrderTests.test'],
        });
        if (!parent || !parent.test || parent.test.type !== 'PANEL') {
            return null;
        }
        const components = await this.testComponentRepo.find({
            where: {
                panelTestId: parent.testId,
                required: true,
            },
            relations: ['childTest'],
            order: { sortOrder: 'ASC' },
        });
        if (components.length === 0) {
            this.logger.warn(`Panel ${parent.test.code} has no required components`);
            return parent.status;
        }
        const children = await this.orderTestRepo.find({
            where: { parentOrderTestId: parent.id },
            relations: ['test'],
        });
        const childMap = new Map(children.map(c => [c.testId, c]));
        let hasRejected = false;
        let hasIncomplete = false;
        let allVerified = true;
        let allCompleted = true;
        for (const component of components) {
            const child = childMap.get(component.childTestId);
            if (!child) {
                hasIncomplete = true;
                allCompleted = false;
                allVerified = false;
                continue;
            }
            if (child.status === order_test_entity_1.OrderTestStatus.REJECTED) {
                hasRejected = true;
                allVerified = false;
                allCompleted = false;
                break;
            }
            if (child.status !== order_test_entity_1.OrderTestStatus.VERIFIED) {
                allVerified = false;
            }
            if (!child.resultValue && !child.resultText) {
                hasIncomplete = true;
                allCompleted = false;
                allVerified = false;
            }
            else if (child.status === order_test_entity_1.OrderTestStatus.PENDING || child.status === order_test_entity_1.OrderTestStatus.IN_PROGRESS) {
                hasIncomplete = true;
                allCompleted = false;
                allVerified = false;
            }
        }
        let newStatus;
        if (hasRejected) {
            newStatus = order_test_entity_1.OrderTestStatus.REJECTED;
        }
        else if (allVerified) {
            newStatus = order_test_entity_1.OrderTestStatus.VERIFIED;
        }
        else if (allCompleted && !hasIncomplete) {
            newStatus = order_test_entity_1.OrderTestStatus.COMPLETED;
        }
        else {
            newStatus = order_test_entity_1.OrderTestStatus.IN_PROGRESS;
        }
        if (parent.status !== newStatus) {
            parent.status = newStatus;
            await this.orderTestRepo.save(parent);
            this.logger.log(`Panel ${parent.test.code} status updated: ${parent.status} -> ${newStatus}`);
        }
        return newStatus;
    }
    async recomputePanelsForSample(sampleId) {
        const parents = await this.orderTestRepo.find({
            where: { sampleId },
            relations: ['test'],
        });
        const panelParents = parents.filter(p => p.test?.type === 'PANEL' && !p.parentOrderTestId);
        for (const parent of panelParents) {
            await this.recomputePanelStatus(parent.id);
        }
    }
    async recomputeAfterChildUpdate(childOrderTestId) {
        const child = await this.orderTestRepo.findOne({
            where: { id: childOrderTestId },
            relations: ['parentOrderTest'],
        });
        if (child?.parentOrderTestId) {
            await this.recomputePanelStatus(child.parentOrderTestId);
        }
    }
};
exports.PanelStatusService = PanelStatusService;
exports.PanelStatusService = PanelStatusService = PanelStatusService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(order_test_entity_1.OrderTest)),
    __param(1, (0, typeorm_1.InjectRepository)(test_component_entity_1.TestComponent)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], PanelStatusService);
//# sourceMappingURL=panel-status.service.js.map