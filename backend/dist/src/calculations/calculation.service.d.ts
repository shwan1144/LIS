import { Repository } from 'typeorm';
import { OrderTest } from '../entities/order-test.entity';
export declare class CalculationService {
    private readonly orderTestRepo;
    private readonly logger;
    constructor(orderTestRepo: Repository<OrderTest>);
    processOrderCalculations(orderId: string, labId: string, actorId?: string): Promise<void>;
    private calculateVLDL;
    private calculateHOMA;
    private calculateTSAT;
    private calculateEGFR;
}
