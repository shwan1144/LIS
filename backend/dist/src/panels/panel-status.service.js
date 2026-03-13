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
let PanelStatusService = PanelStatusService_1 = class PanelStatusService {
    constructor(orderTestRepo) {
        this.orderTestRepo = orderTestRepo;
        this.logger = new common_1.Logger(PanelStatusService_1.name);
    }
    async recomputePanelStatus(parentOrderTestId) {
        const parent = await this.orderTestRepo.findOne({
            where: { id: parentOrderTestId },
            relations: ['test'],
        });
        if (!parent || !parent.test || parent.test.type !== 'PANEL') {
            return null;
        }
        const children = await this.orderTestRepo.find({
            where: { parentOrderTestId: parent.id },
            select: [
                'id',
                'status',
                'resultValue',
                'resultText',
                'resultParameters',
                'cultureResult',
            ],
        });
        if (children.length === 0) {
            const orphanStatus = parent.status === order_test_entity_1.OrderTestStatus.REJECTED
                ? order_test_entity_1.OrderTestStatus.REJECTED
                : order_test_entity_1.OrderTestStatus.VERIFIED;
            if (parent.status !== orphanStatus) {
                parent.status = orphanStatus;
                await this.orderTestRepo.save(parent);
            }
            this.logger.warn(`Panel ${parent.test.code} has no child rows in this order; normalized to ${orphanStatus}`);
            return orphanStatus;
        }
        const childStatuses = children.map((child) => child.status);
        const hasRejected = childStatuses.some((status) => status === order_test_entity_1.OrderTestStatus.REJECTED);
        const allVerified = childStatuses.every((status) => status === order_test_entity_1.OrderTestStatus.VERIFIED);
        const allFinalized = childStatuses.every((status) => status !== order_test_entity_1.OrderTestStatus.PENDING && status !== order_test_entity_1.OrderTestStatus.IN_PROGRESS);
        let newStatus;
        if (hasRejected) {
            newStatus = order_test_entity_1.OrderTestStatus.REJECTED;
        }
        else if (allVerified) {
            newStatus = order_test_entity_1.OrderTestStatus.VERIFIED;
        }
        else if (allFinalized) {
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
            relations: ['parentOrderTest', 'test'],
        });
        if (child?.parentOrderTestId) {
            await this.recomputePanelStatus(child.parentOrderTestId);
            return;
        }
        if (child?.test?.type === 'PANEL') {
            await this.recomputePanelStatus(child.id);
        }
    }
};
exports.PanelStatusService = PanelStatusService;
exports.PanelStatusService = PanelStatusService = PanelStatusService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(order_test_entity_1.OrderTest)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], PanelStatusService);
//# sourceMappingURL=panel-status.service.js.map