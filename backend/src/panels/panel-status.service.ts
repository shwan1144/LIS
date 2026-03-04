import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderTest, OrderTestStatus } from '../entities/order-test.entity';

/**
 * Service to recompute parent panel OrderTest status based on this order's child rows.
 *
 * Rules (order-local, drift-safe for historical data):
 * - REJECTED: Any child rejected
 * - VERIFIED: All children verified
 * - COMPLETED: All children finalized (not PENDING/IN_PROGRESS) but not all verified
 * - IN_PROGRESS: Otherwise
 */
@Injectable()
export class PanelStatusService {
  private readonly logger = new Logger(PanelStatusService.name);

  constructor(
    @InjectRepository(OrderTest)
    private readonly orderTestRepo: Repository<OrderTest>,
  ) {}

  /**
   * Recompute status for a parent panel OrderTest based on its children
   */
  async recomputePanelStatus(parentOrderTestId: string): Promise<OrderTestStatus | null> {
    const parent = await this.orderTestRepo.findOne({
      where: { id: parentOrderTestId },
      relations: ['test'],
    });

    if (!parent || !parent.test || parent.test.type !== 'PANEL') {
      return null; // Not a panel
    }

    // Use actual child rows on this order (historical-safe, avoids test definition drift).
    const children = await this.orderTestRepo.find({
      where: { parentOrderTestId: parent.id },
      select: ['id', 'status'],
    });

    if (children.length === 0) {
      // Historical safety: orphan panel roots must not block Worklist/Verification forever.
      // If no child rows exist, treat as finalized unless explicitly rejected.
      const orphanStatus =
        parent.status === OrderTestStatus.REJECTED
          ? OrderTestStatus.REJECTED
          : OrderTestStatus.VERIFIED;
      if (parent.status !== orphanStatus) {
        parent.status = orphanStatus;
        await this.orderTestRepo.save(parent);
      }
      this.logger.warn(
        `Panel ${parent.test.code} has no child rows in this order; normalized to ${orphanStatus}`,
      );
      return orphanStatus;
    }

    const childStatuses = children.map((child) => child.status);
    const hasRejected = childStatuses.some((status) => status === OrderTestStatus.REJECTED);
    const allVerified = childStatuses.every((status) => status === OrderTestStatus.VERIFIED);
    const allFinalized = childStatuses.every(
      (status) =>
        status !== OrderTestStatus.PENDING && status !== OrderTestStatus.IN_PROGRESS,
    );

    let newStatus: OrderTestStatus;
    if (hasRejected) {
      newStatus = OrderTestStatus.REJECTED;
    } else if (allVerified) {
      newStatus = OrderTestStatus.VERIFIED;
    } else if (allFinalized) {
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
      relations: ['parentOrderTest', 'test'],
    });

    if (child?.parentOrderTestId) {
      await this.recomputePanelStatus(child.parentOrderTestId);
      return;
    }

    // Defensive fallback: if caller passes a panel root ID by mistake, recompute it directly.
    if (child?.test?.type === 'PANEL') {
      await this.recomputePanelStatus(child.id);
    }
  }
}
