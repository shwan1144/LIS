import { Repository } from 'typeorm';
import { OrderTest, OrderTestStatus } from '../entities/order-test.entity';
import { TestComponent } from '../entities/test-component.entity';
export declare class PanelStatusService {
    private readonly orderTestRepo;
    private readonly testComponentRepo;
    private readonly logger;
    constructor(orderTestRepo: Repository<OrderTest>, testComponentRepo: Repository<TestComponent>);
    recomputePanelStatus(parentOrderTestId: string): Promise<OrderTestStatus | null>;
    recomputePanelsForSample(sampleId: string): Promise<void>;
    recomputeAfterChildUpdate(childOrderTestId: string): Promise<void>;
}
