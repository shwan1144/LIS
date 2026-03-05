import { Repository } from 'typeorm';
import { OrderTest, OrderTestStatus } from '../entities/order-test.entity';
export declare class PanelStatusService {
    private readonly orderTestRepo;
    private readonly logger;
    constructor(orderTestRepo: Repository<OrderTest>);
    recomputePanelStatus(parentOrderTestId: string): Promise<OrderTestStatus | null>;
    recomputePanelsForSample(sampleId: string): Promise<void>;
    recomputeAfterChildUpdate(childOrderTestId: string): Promise<void>;
}
