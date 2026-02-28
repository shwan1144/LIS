import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderTest, OrderTestStatus } from '../entities/order-test.entity';
import { TestComponent } from '../entities/test-component.entity';

/**
 * Service to recompute parent panel OrderTest status based on child OrderTests
 * 
 * Rules:
 * - IN_PROGRESS: Some required children missing results
 * - COMPLETED: All required children have results
 * - VERIFIED: All required children verified
 * - REJECTED: Any required child rejected
 */
@Injectable()
export class PanelStatusService {
  private readonly logger = new Logger(PanelStatusService.name);

  constructor(
    @InjectRepository(OrderTest)
    private readonly orderTestRepo: Repository<OrderTest>,
    @InjectRepository(TestComponent)
    private readonly testComponentRepo: Repository<TestComponent>,
  ) {}

  /**
   * Recompute status for a parent panel OrderTest based on its children
   */
  async recomputePanelStatus(parentOrderTestId: string): Promise<OrderTestStatus | null> {
    const parent = await this.orderTestRepo.findOne({
      where: { id: parentOrderTestId },
      relations: ['test', 'childOrderTests', 'childOrderTests.test'],
    });

    if (!parent || !parent.test || parent.test.type !== 'PANEL') {
      return null; // Not a panel
    }

    // Get required child components
    const components = await this.testComponentRepo.find({
      where: {
        panelTestId: parent.testId,
        required: true,
        // TODO: Add effectiveFrom/effectiveTo filtering if needed
      },
      relations: ['childTest'],
      order: { sortOrder: 'ASC' },
    });

    if (components.length === 0) {
      this.logger.warn(`Panel ${parent.test.code} has no required components`);
      return parent.status; // Keep current status
    }

    // Get child OrderTests for this parent
    const children = await this.orderTestRepo.find({
      where: { parentOrderTestId: parent.id },
      relations: ['test'],
    });

    const childMap = new Map(children.map(c => [c.testId, c]));

    // Check each required component
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

      if (child.status === OrderTestStatus.REJECTED) {
        hasRejected = true;
        allVerified = false;
        allCompleted = false;
        break; // One rejection fails the panel
      }

      if (child.status !== OrderTestStatus.VERIFIED) {
        allVerified = false;
      }

      // Check if child has a result
      if (!child.resultValue && !child.resultText) {
        hasIncomplete = true;
        allCompleted = false;
        allVerified = false;
      } else if (child.status === OrderTestStatus.PENDING || child.status === OrderTestStatus.IN_PROGRESS) {
        hasIncomplete = true;
        allCompleted = false;
        allVerified = false;
      }
    }

    // Determine new status
    let newStatus: OrderTestStatus;
    if (hasRejected) {
      newStatus = OrderTestStatus.REJECTED;
    } else if (allVerified) {
      newStatus = OrderTestStatus.VERIFIED;
    } else if (allCompleted && !hasIncomplete) {
      newStatus = OrderTestStatus.COMPLETED;
    } else {
      newStatus = OrderTestStatus.IN_PROGRESS;
    }

    // Update if changed
    if (parent.status !== newStatus) {
      parent.status = newStatus;
      await this.orderTestRepo.save(parent);
      this.logger.log(`Panel ${parent.test.code} status updated: ${parent.status} -> ${newStatus}`);
    }

    return newStatus;
  }

  /**
   * Recompute all parent panels for a given sample
   * Called after any child OrderTest is updated
   */
  async recomputePanelsForSample(sampleId: string): Promise<void> {
    // Find all parent OrderTests (panels) for this sample
    const parents = await this.orderTestRepo.find({
      where: { sampleId },
      relations: ['test'],
    });

    const panelParents = parents.filter(p => p.test?.type === 'PANEL' && !p.parentOrderTestId);

    for (const parent of panelParents) {
      await this.recomputePanelStatus(parent.id);
    }
  }

  /**
   * Recompute panel status after a child OrderTest update
   */
  async recomputeAfterChildUpdate(childOrderTestId: string): Promise<void> {
    const child = await this.orderTestRepo.findOne({
      where: { id: childOrderTestId },
      relations: ['parentOrderTest'],
    });

    if (child?.parentOrderTestId) {
      await this.recomputePanelStatus(child.parentOrderTestId);
    }
  }
}
