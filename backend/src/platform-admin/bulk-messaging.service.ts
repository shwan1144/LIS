import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { RlsSessionService } from '../database/rls-session.service';
import { AuditAction, AuditActorType } from '../entities/audit-log.entity';
import { Lab } from '../entities/lab.entity';
import {
  LabMarketingTemplate,
  LabMessagingChannelConfig,
  MarketingChannel,
  MarketingMessageBatch,
  MarketingMessageBatchStatus,
  MarketingMessageRecipient,
  MarketingMessageRecipientStatus,
} from '../entities/marketing-message.entity';
import { Order, OrderStatus } from '../entities/order.entity';

export interface PlatformActorContext {
  platformUserId: string;
  role: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface BulkMessagingFilterInput {
  labId: string;
  status?: string | null;
  q?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface BulkMessagingPreviewInput extends BulkMessagingFilterInput {
  excludedPhones?: string[] | string | null;
}

export interface BulkMessagingSendInput extends BulkMessagingPreviewInput {
  channels: string[];
  templateOverrides?: Record<string, string | null | undefined> | null;
}

export interface BulkMessagingJobListInput {
  labId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  size?: number;
}

export interface BulkMessagingJobDetailInput {
  page?: number;
  size?: number;
  status?: string;
  channel?: string;
}

type ChannelConfigPatch = {
  enabled?: boolean;
  webhookUrl?: string | null;
  authToken?: string | null;
  senderLabel?: string | null;
  timeoutMs?: number;
  maxRetries?: number;
};

const CHANNELS: MarketingChannel[] = [
  MarketingChannel.WHATSAPP,
  MarketingChannel.VIBER,
  MarketingChannel.SMS,
];
const MAX_BATCH_UNIQUE_PHONES = 5000;
const DEFAULT_CHANNEL_TIMEOUT_MS = 10_000;
const DEFAULT_CHANNEL_MAX_RETRIES = 2;

interface RecipientCandidate {
  orderId: string;
  patientId: string;
  labId: string;
  labName: string;
  patientName: string | null;
  phoneRaw: string;
  phoneNormalized: string;
  registeredAt: Date;
}

interface ScopedRecipientResolution {
  matchedOrdersCount: number;
  phonesWithValueCount: number;
  phonesWithoutValueCount: number;
  uniquePhonesCount: number;
  excludedCount: number;
  finalCandidates: RecipientCandidate[];
}

@Injectable()
export class BulkMessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BulkMessagingService.name);
  private readonly pollIntervalMs = 3000;
  private readonly staleRunningMs = 30 * 60 * 1000;
  private readonly maxBatchUniquePhones = MAX_BATCH_UNIQUE_PHONES;

  private pollTimer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    @InjectRepository(Lab)
    private readonly labRepo: Repository<Lab>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(LabMessagingChannelConfig)
    private readonly channelConfigRepo: Repository<LabMessagingChannelConfig>,
    @InjectRepository(LabMarketingTemplate)
    private readonly templateRepo: Repository<LabMarketingTemplate>,
    @InjectRepository(MarketingMessageBatch)
    private readonly batchRepo: Repository<MarketingMessageBatch>,
    @InjectRepository(MarketingMessageRecipient)
    private readonly recipientRepo: Repository<MarketingMessageRecipient>,
    private readonly rlsSessionService: RlsSessionService,
    private readonly auditService: AuditService,
  ) {}

  onModuleInit(): void {
    const env = (process.env.NODE_ENV || '').toLowerCase();
    if (env === 'test') return;
    this.pollTimer = setInterval(() => {
      void this.pollQueue();
    }, this.pollIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async getLabConfig(labId: string): Promise<{
    labId: string;
    channels: Record<string, {
      enabled: boolean;
      webhookUrl: string | null;
      hasAuthToken: boolean;
      senderLabel: string | null;
      timeoutMs: number;
      maxRetries: number;
      updatedAt: string | null;
    }>;
  }> {
    this.requireUuid(labId, 'labId');
    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      await this.ensureLabExists(manager.getRepository(Lab), labId);
      const rows = await manager.getRepository(LabMessagingChannelConfig).find({
        where: { labId },
      });
      return this.toConfigResponse(labId, rows);
    });
  }

  async updateLabConfig(
    labId: string,
    body: { channels?: Record<string, unknown> },
    actor?: PlatformActorContext,
  ): Promise<{
    labId: string;
    channels: Record<string, {
      enabled: boolean;
      webhookUrl: string | null;
      hasAuthToken: boolean;
      senderLabel: string | null;
      timeoutMs: number;
      maxRetries: number;
      updatedAt: string | null;
    }>;
  }> {
    this.requireUuid(labId, 'labId');
    const channelPatches = this.normalizeConfigPatches(body?.channels);

    const response = await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      await this.ensureLabExists(manager.getRepository(Lab), labId);
      const repo = manager.getRepository(LabMessagingChannelConfig);
      const existing = await repo.find({
        where: { labId, channel: In(channelPatches.map((item) => item.channel)) },
      });
      const existingByChannel = new Map(existing.map((item) => [item.channel, item]));

      for (const item of channelPatches) {
        const current = existingByChannel.get(item.channel);
        const next = current ?? repo.create({ labId, channel: item.channel });

        if (item.patch.enabled !== undefined) next.enabled = item.patch.enabled;
        if (item.patch.webhookUrl !== undefined) next.webhookUrl = item.patch.webhookUrl;
        if (item.patch.authToken !== undefined) next.authToken = item.patch.authToken;
        if (item.patch.senderLabel !== undefined) next.senderLabel = item.patch.senderLabel;
        if (item.patch.timeoutMs !== undefined) next.timeoutMs = item.patch.timeoutMs;
        if (item.patch.maxRetries !== undefined) next.maxRetries = item.patch.maxRetries;

        await repo.save(next);
      }

      const rows = await repo.find({ where: { labId } });
      return this.toConfigResponse(labId, rows);
    });

    await this.auditService.log({
      actorType: actor?.platformUserId ? AuditActorType.PLATFORM_USER : null,
      actorId: actor?.platformUserId ?? null,
      labId,
      action: AuditAction.PLATFORM_BULK_MESSAGE_CONFIG_UPDATE,
      entityType: 'lab_messaging_config',
      entityId: labId,
      description: `Updated bulk messaging channel config for lab ${labId}`,
      newValues: { channels: response.channels },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });

    return response;
  }

  async getLabTemplates(labId: string): Promise<{
    labId: string;
    templates: Record<string, { templateText: string; updatedAt: string | null }>;
  }> {
    this.requireUuid(labId, 'labId');
    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      await this.ensureLabExists(manager.getRepository(Lab), labId);
      const rows = await manager.getRepository(LabMarketingTemplate).find({
        where: { labId },
      });
      return this.toTemplatesResponse(labId, rows);
    });
  }

  async updateLabTemplates(
    labId: string,
    body: { templates?: Record<string, string | null | undefined> },
    actor?: PlatformActorContext,
  ): Promise<{
    labId: string;
    templates: Record<string, { templateText: string; updatedAt: string | null }>;
  }> {
    this.requireUuid(labId, 'labId');
    const updates = this.normalizeTemplateUpdates(body?.templates);
    if (updates.length === 0) {
      throw new BadRequestException('templates payload is empty');
    }

    const response = await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      await this.ensureLabExists(manager.getRepository(Lab), labId);
      const repo = manager.getRepository(LabMarketingTemplate);
      const existing = await repo.find({
        where: { labId, channel: In(updates.map((item) => item.channel)) },
      });
      const existingByChannel = new Map(existing.map((item) => [item.channel, item]));

      for (const item of updates) {
        const row = existingByChannel.get(item.channel) ?? repo.create({ labId, channel: item.channel });
        row.templateText = item.templateText;
        row.updatedBy = actor?.platformUserId ?? null;
        await repo.save(row);
      }

      const rows = await repo.find({ where: { labId } });
      return this.toTemplatesResponse(labId, rows);
    });

    await this.auditService.log({
      actorType: actor?.platformUserId ? AuditActorType.PLATFORM_USER : null,
      actorId: actor?.platformUserId ?? null,
      labId,
      action: AuditAction.PLATFORM_BULK_MESSAGE_CONFIG_UPDATE,
      entityType: 'lab_marketing_template',
      entityId: labId,
      description: `Updated bulk messaging templates for lab ${labId}`,
      newValues: { templates: response.templates },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });

    return response;
  }

  async preview(input: BulkMessagingPreviewInput): Promise<{
    matchedOrdersCount: number;
    phonesWithValueCount: number;
    phonesWithoutValueCount: number;
    uniquePhonesCount: number;
    excludedCount: number;
    finalSendCount: number;
    maxBatchUniquePhones: number;
  }> {
    const filters = this.normalizeFilters(input);
    const excludedSet = this.normalizeExcludedPhones(input.excludedPhones);
    const resolution = await this.rlsSessionService.withPlatformAdminContext(async (manager) =>
      this.resolveScopedRecipients(manager.getRepository(Order), filters, excludedSet),
    );

    if (resolution.finalCandidates.length > this.maxBatchUniquePhones) {
      throw new BadRequestException(
        `Preview recipient count exceeds limit (${this.maxBatchUniquePhones}). Refine filters.`,
      );
    }

    return {
      matchedOrdersCount: resolution.matchedOrdersCount,
      phonesWithValueCount: resolution.phonesWithValueCount,
      phonesWithoutValueCount: resolution.phonesWithoutValueCount,
      uniquePhonesCount: resolution.uniquePhonesCount,
      excludedCount: resolution.excludedCount,
      finalSendCount: resolution.finalCandidates.length,
      maxBatchUniquePhones: this.maxBatchUniquePhones,
    };
  }

  async send(
    input: BulkMessagingSendInput,
    actor?: PlatformActorContext,
  ): Promise<{
    batchId: string;
    queuedRecipientsCount: number;
    uniquePhonesCount: number;
    channels: MarketingChannel[];
  }> {
    const filters = this.normalizeFilters(input);
    const excludedSet = this.normalizeExcludedPhones(input.excludedPhones);
    const channels = this.normalizeChannelArray(input.channels, 'channels');
    const templateOverrides = this.normalizeTemplateOverrideMap(input.templateOverrides);

    const result = await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const labRepo = manager.getRepository(Lab);
      const batchRepo = manager.getRepository(MarketingMessageBatch);
      const recipientRepo = manager.getRepository(MarketingMessageRecipient);
      const configRepo = manager.getRepository(LabMessagingChannelConfig);
      const templateRepo = manager.getRepository(LabMarketingTemplate);

      await this.ensureLabExists(labRepo, filters.labId);
      const resolution = await this.resolveScopedRecipients(manager.getRepository(Order), filters, excludedSet);

      if (resolution.finalCandidates.length === 0) {
        throw new BadRequestException('No recipients after filtering/exclusions');
      }
      if (resolution.finalCandidates.length > this.maxBatchUniquePhones) {
        throw new BadRequestException(
          `Recipient count exceeds limit (${this.maxBatchUniquePhones}). Refine filters.`,
        );
      }

      const configs = await configRepo.find({
        where: { labId: filters.labId, channel: In(channels) },
      });
      const configByChannel = new Map(configs.map((item) => [item.channel, item]));
      for (const channel of channels) {
        const config = configByChannel.get(channel);
        if (!config || !config.enabled || !config.webhookUrl) {
          throw new BadRequestException(
            `Channel ${channel} is not fully configured/enabled for this lab`,
          );
        }
      }

      const templateRows = await templateRepo.find({
        where: { labId: filters.labId, channel: In(channels) },
      });
      const templatesByChannel = new Map(
        templateRows.map((item) => [item.channel, item.templateText ?? '']),
      );

      const batch = batchRepo.create({
        labId: filters.labId,
        createdBy: actor?.platformUserId ?? null,
        status: MarketingMessageBatchStatus.QUEUED,
        channels,
        scope: {
          ...filters,
          dedupe: 'unique_phone',
        },
        excludedPhones: Array.from(excludedSet),
      });
      await batchRepo.save(batch);

      const recipientRows: MarketingMessageRecipient[] = [];
      for (const candidate of resolution.finalCandidates) {
        for (const channel of channels) {
          const baseTemplate =
            templateOverrides.get(channel) ??
            templatesByChannel.get(channel) ??
            '';
          const messageText = this.renderTemplate(baseTemplate, {
            patientName: candidate.patientName,
            labName: candidate.labName,
          });
          if (!messageText.trim()) {
            throw new BadRequestException(`Template is empty for channel ${channel}`);
          }

          recipientRows.push(recipientRepo.create({
            batchId: batch.id,
            labId: filters.labId,
            channel,
            status: MarketingMessageRecipientStatus.PENDING,
            orderId: candidate.orderId,
            patientId: candidate.patientId,
            recipientName: candidate.patientName,
            recipientPhoneRaw: candidate.phoneRaw,
            recipientPhoneNormalized: candidate.phoneNormalized,
            messageText,
          }));
        }
      }

      await recipientRepo.save(recipientRows);
      batch.requestedRecipientsCount = recipientRows.length;
      await batchRepo.save(batch);

      await this.auditService.log({
        actorType: actor?.platformUserId ? AuditActorType.PLATFORM_USER : null,
        actorId: actor?.platformUserId ?? null,
        labId: filters.labId,
        action: AuditAction.PLATFORM_BULK_MESSAGE_SEND,
        entityType: 'marketing_message_batch',
        entityId: batch.id,
        description: `Queued bulk message batch with ${recipientRows.length} recipient sends`,
        newValues: {
          filters,
          channels,
          matchedOrdersCount: resolution.matchedOrdersCount,
          uniquePhonesCount: resolution.uniquePhonesCount,
          excludedCount: resolution.excludedCount,
          finalUniquePhonesCount: resolution.finalCandidates.length,
          queuedRecipientsCount: recipientRows.length,
        },
        ipAddress: actor?.ipAddress ?? null,
        userAgent: actor?.userAgent ?? null,
      }, manager);

      return {
        batchId: batch.id,
        queuedRecipientsCount: recipientRows.length,
        uniquePhonesCount: resolution.finalCandidates.length,
        channels,
      };
    });

    this.triggerImmediatePoll();
    return result;
  }

  async listJobs(input: BulkMessagingJobListInput): Promise<{
    items: Array<{
      id: string;
      labId: string;
      status: MarketingMessageBatchStatus;
      channels: MarketingChannel[];
      requestedRecipientsCount: number;
      sentCount: number;
      failedCount: number;
      skippedCount: number;
      startedAt: string | null;
      completedAt: string | null;
      createdAt: string;
      errorMessage: string | null;
    }>;
    total: number;
    page: number;
    size: number;
    totalPages: number;
  }> {
    const page = Math.max(1, Number(input.page ?? 1));
    const size = Math.min(100, Math.max(1, Number(input.size ?? 25)));
    const status = this.normalizeOptionalBatchStatus(input.status);
    const labId = this.normalizeOptionalUuid(input.labId, 'labId');
    const dateFrom = this.normalizeOptionalDate(input.dateFrom, 'dateFrom');
    const dateTo = this.normalizeOptionalDate(input.dateTo, 'dateTo');
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom cannot be after dateTo');
    }

    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const repo = manager.getRepository(MarketingMessageBatch);
      const qb = repo.createQueryBuilder('batch');
      if (labId) qb.andWhere('batch.labId = :labId', { labId });
      if (status) qb.andWhere('batch.status = :status', { status });
      if (dateFrom) qb.andWhere('batch.createdAt >= :dateFrom', { dateFrom });
      if (dateTo) qb.andWhere('batch.createdAt <= :dateTo', { dateTo });

      const total = await qb.clone().getCount();
      const items = await qb
        .clone()
        .orderBy('batch.createdAt', 'DESC')
        .skip((page - 1) * size)
        .take(size)
        .getMany();

      return {
        items: items.map((item) => ({
          id: item.id,
          labId: item.labId,
          status: item.status,
          channels: Array.isArray(item.channels) ? item.channels : [],
          requestedRecipientsCount: item.requestedRecipientsCount ?? 0,
          sentCount: item.sentCount ?? 0,
          failedCount: item.failedCount ?? 0,
          skippedCount: item.skippedCount ?? 0,
          startedAt: item.startedAt ? item.startedAt.toISOString() : null,
          completedAt: item.completedAt ? item.completedAt.toISOString() : null,
          createdAt: item.createdAt.toISOString(),
          errorMessage: item.errorMessage ?? null,
        })),
        total,
        page,
        size,
        totalPages: Math.ceil(total / size),
      };
    });
  }

  async getJobDetail(
    batchId: string,
    input: BulkMessagingJobDetailInput = {},
  ): Promise<{
    batch: {
      id: string;
      labId: string;
      status: MarketingMessageBatchStatus;
      channels: MarketingChannel[];
      scope: Record<string, unknown>;
      excludedPhones: string[];
      requestedRecipientsCount: number;
      sentCount: number;
      failedCount: number;
      skippedCount: number;
      startedAt: string | null;
      completedAt: string | null;
      createdAt: string;
      errorMessage: string | null;
    };
    recipients: {
      items: Array<{
        id: string;
        channel: MarketingChannel;
        status: MarketingMessageRecipientStatus;
        recipientName: string | null;
        recipientPhoneRaw: string | null;
        recipientPhoneNormalized: string;
        attemptCount: number;
        sentAt: string | null;
        errorMessage: string | null;
        orderId: string | null;
        patientId: string | null;
      }>;
      total: number;
      page: number;
      size: number;
      totalPages: number;
    };
  }> {
    this.requireUuid(batchId, 'batchId');
    const page = Math.max(1, Number(input.page ?? 1));
    const size = Math.min(500, Math.max(1, Number(input.size ?? 100)));
    const status = this.normalizeOptionalRecipientStatus(input.status);
    const channel = this.normalizeOptionalChannel(input.channel);

    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const batchRepo = manager.getRepository(MarketingMessageBatch);
      const recipientRepo = manager.getRepository(MarketingMessageRecipient);
      const batch = await batchRepo.findOne({ where: { id: batchId } });
      if (!batch) {
        throw new NotFoundException('Batch not found');
      }

      const qb = recipientRepo.createQueryBuilder('recipient')
        .where('recipient.batchId = :batchId', { batchId });
      if (status) qb.andWhere('recipient.status = :status', { status });
      if (channel) qb.andWhere('recipient.channel = :channel', { channel });

      const total = await qb.clone().getCount();
      const rows = await qb
        .clone()
        .orderBy('recipient.createdAt', 'ASC')
        .skip((page - 1) * size)
        .take(size)
        .getMany();

      return {
        batch: {
          id: batch.id,
          labId: batch.labId,
          status: batch.status,
          channels: Array.isArray(batch.channels) ? batch.channels : [],
          scope: this.toRecord(batch.scope),
          excludedPhones: Array.isArray(batch.excludedPhones) ? batch.excludedPhones : [],
          requestedRecipientsCount: batch.requestedRecipientsCount ?? 0,
          sentCount: batch.sentCount ?? 0,
          failedCount: batch.failedCount ?? 0,
          skippedCount: batch.skippedCount ?? 0,
          startedAt: batch.startedAt ? batch.startedAt.toISOString() : null,
          completedAt: batch.completedAt ? batch.completedAt.toISOString() : null,
          createdAt: batch.createdAt.toISOString(),
          errorMessage: batch.errorMessage ?? null,
        },
        recipients: {
          items: rows.map((row) => ({
            id: row.id,
            channel: row.channel,
            status: row.status,
            recipientName: row.recipientName ?? null,
            recipientPhoneRaw: row.recipientPhoneRaw ?? null,
            recipientPhoneNormalized: row.recipientPhoneNormalized,
            attemptCount: row.attemptCount ?? 0,
            sentAt: row.sentAt ? row.sentAt.toISOString() : null,
            errorMessage: row.errorMessage ?? null,
            orderId: row.orderId ?? null,
            patientId: row.patientId ?? null,
          })),
          total,
          page,
          size,
          totalPages: Math.ceil(total / size),
        },
      };
    });
  }

  private triggerImmediatePoll(): void {
    setTimeout(() => {
      void this.pollQueue();
    }, 0);
  }

  private async pollQueue(): Promise<void> {
    if (this.polling) return;
    this.polling = true;

    try {
      await this.requeueStaleRunningBatches();
      const claimedBatchId = await this.claimNextBatch();
      if (!claimedBatchId) return;
      await this.processBatch(claimedBatchId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Bulk messaging poll failed: ${message}`);
    } finally {
      this.polling = false;
    }
  }

  private async requeueStaleRunningBatches(): Promise<void> {
    await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      await manager.query(
        `
          UPDATE "marketing_message_batches"
          SET "status" = 'QUEUED',
              "updatedAt" = now(),
              "errorMessage" = COALESCE("errorMessage", 'Requeued stale running batch')
          WHERE "status" = 'RUNNING'
            AND "startedAt" IS NOT NULL
            AND "startedAt" < now() - ($1::text || ' milliseconds')::interval
        `,
        [String(this.staleRunningMs)],
      );
      return null;
    });
  }

  private async claimNextBatch(): Promise<string | null> {
    return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const rows = await manager.query(
        `
          WITH candidate AS (
            SELECT "id"
            FROM "marketing_message_batches"
            WHERE "status" = 'QUEUED'
            ORDER BY "createdAt" ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          )
          UPDATE "marketing_message_batches" AS batch
          SET "status" = 'RUNNING',
              "startedAt" = COALESCE(batch."startedAt", now()),
              "updatedAt" = now(),
              "errorMessage" = NULL
          FROM candidate
          WHERE batch."id" = candidate."id"
          RETURNING batch."id" AS "id"
        `,
      ) as Array<{ id: string }>;
      return rows[0]?.id ?? null;
    });
  }

  private async processBatch(batchId: string): Promise<void> {
    const state = await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const batch = await manager.getRepository(MarketingMessageBatch).findOne({
        where: { id: batchId },
      });
      if (!batch) return null;

      const recipients = await manager.getRepository(MarketingMessageRecipient).find({
        where: { batchId, status: MarketingMessageRecipientStatus.PENDING },
        order: { createdAt: 'ASC' },
      });

      const configs = await manager.getRepository(LabMessagingChannelConfig).find({
        where: { labId: batch.labId, channel: In(CHANNELS) },
      });

      return {
        batch,
        recipients,
        configsByChannel: new Map(configs.map((item) => [item.channel, item])),
      };
    });

    if (!state) return;

    const updates: Array<Partial<MarketingMessageRecipient> & { id: string }> = [];
    for (const recipient of state.recipients) {
      const config = state.configsByChannel.get(recipient.channel);
      if (!config || !config.enabled || !config.webhookUrl) {
        updates.push({
          id: recipient.id,
          status: MarketingMessageRecipientStatus.SKIPPED,
          errorMessage: 'Channel disabled or webhook URL not configured',
          lastAttemptAt: new Date(),
        });
      } else {
        const outcome = await this.sendWithRetry(recipient, config, state.batch.id);
        updates.push({
          id: recipient.id,
          status: outcome.status,
          attemptCount: outcome.attemptCount,
          lastAttemptAt: new Date(),
          sentAt: outcome.status === MarketingMessageRecipientStatus.SENT ? new Date() : null,
          errorMessage: outcome.errorMessage ?? null,
        });
      }

      if (updates.length >= 50) {
        await this.flushRecipientUpdates(updates.splice(0, updates.length));
      }
    }

    if (updates.length > 0) {
      await this.flushRecipientUpdates(updates);
    }

    await this.finalizeBatchState(state.batch.id, state.batch.labId, state.batch.createdBy);
  }

  private async flushRecipientUpdates(
    updates: Array<Partial<MarketingMessageRecipient> & { id: string }>,
  ): Promise<void> {
    await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      await manager.getRepository(MarketingMessageRecipient).save(updates);
      return null;
    });
  }

  private async finalizeBatchState(
    batchId: string,
    labId: string,
    createdBy: string | null,
  ): Promise<void> {
    await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
      const rows = await manager.query(
        `
          SELECT "status", COUNT(*)::int AS "count"
          FROM "marketing_message_recipients"
          WHERE "batchId" = $1
          GROUP BY "status"
        `,
        [batchId],
      ) as Array<{ status: MarketingMessageRecipientStatus; count: number }>;

      let sentCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      for (const row of rows) {
        if (row.status === MarketingMessageRecipientStatus.SENT) sentCount = Number(row.count) || 0;
        if (row.status === MarketingMessageRecipientStatus.FAILED) failedCount = Number(row.count) || 0;
        if (row.status === MarketingMessageRecipientStatus.SKIPPED) skippedCount = Number(row.count) || 0;
      }

      let status = MarketingMessageBatchStatus.COMPLETED;
      if (failedCount > 0 || skippedCount > 0) {
        status = sentCount > 0 || skippedCount > 0
          ? MarketingMessageBatchStatus.COMPLETED_WITH_ERRORS
          : MarketingMessageBatchStatus.FAILED;
      }

      const batchRepo = manager.getRepository(MarketingMessageBatch);
      await batchRepo.update(
        { id: batchId },
        {
          status,
          sentCount,
          failedCount,
          skippedCount,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      );

      await this.auditService.log({
        actorType: createdBy ? AuditActorType.PLATFORM_USER : null,
        actorId: createdBy ?? null,
        labId,
        action: AuditAction.PLATFORM_BULK_MESSAGE_JOB_UPDATE,
        entityType: 'marketing_message_batch',
        entityId: batchId,
        description: `Bulk message batch ${batchId} finished with status ${status}`,
        newValues: {
          status,
          sentCount,
          failedCount,
          skippedCount,
        },
      }, manager);

      return null;
    });
  }

  private async sendWithRetry(
    recipient: MarketingMessageRecipient,
    config: LabMessagingChannelConfig,
    batchId: string,
  ): Promise<{
    status: MarketingMessageRecipientStatus;
    attemptCount: number;
    errorMessage: string | null;
  }> {
    const maxRetries = this.clampInteger(
      config.maxRetries,
      0,
      5,
      DEFAULT_CHANNEL_MAX_RETRIES,
    );
    const timeoutMs = this.clampInteger(
      config.timeoutMs,
      1000,
      60_000,
      DEFAULT_CHANNEL_TIMEOUT_MS,
    );

    let attemptCount = 0;
    let lastError: string | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      attemptCount += 1;
      try {
        const response = await this.postToWebhook(recipient, config, batchId, timeoutMs);
        if (response.ok) {
          return {
            status: MarketingMessageRecipientStatus.SENT,
            attemptCount,
            errorMessage: null,
          };
        }
        const responseBody = await response.text().catch(() => '');
        lastError = `Webhook response ${response.status}: ${responseBody.slice(0, 300)}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      if (attempt < maxRetries) {
        await this.delay(Math.min(5000, 1000 * (2 ** attempt)));
      }
    }

    return {
      status: MarketingMessageRecipientStatus.FAILED,
      attemptCount,
      errorMessage: lastError ?? 'Unknown dispatch error',
    };
  }

  private async postToWebhook(
    recipient: MarketingMessageRecipient,
    config: LabMessagingChannelConfig,
    batchId: string,
    timeoutMs: number,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.authToken?.trim()) {
      headers.Authorization = `Bearer ${config.authToken.trim()}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(config.webhookUrl as string, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          batchId,
          channel: recipient.channel,
          labId: recipient.labId,
          recipientPhone: recipient.recipientPhoneNormalized,
          recipientName: recipient.recipientName ?? 'Patient',
          message: recipient.messageText,
          orderId: recipient.orderId,
          patientId: recipient.patientId,
          senderLabel: config.senderLabel ?? null,
        }),
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async resolveScopedRecipients(
    repo: Repository<Order>,
    filters: BulkMessagingFilterInput,
    excludedSet: Set<string>,
  ): Promise<ScopedRecipientResolution> {
    const qb = repo
      .createQueryBuilder('o')
      .leftJoin('o.patient', 'patient')
      .leftJoin('o.lab', 'lab')
      .leftJoin('o.samples', 'samples')
      .select('o.id', 'orderId')
      .addSelect('o.registeredAt', 'registeredAt')
      .addSelect('o.labId', 'labId')
      .addSelect('lab.name', 'labName')
      .addSelect('patient.id', 'patientId')
      .addSelect('patient.fullName', 'patientName')
      .addSelect('patient.phone', 'patientPhone')
      .where('o.labId = :labId', { labId: filters.labId })
      .orderBy('o.registeredAt', 'DESC')
      .addOrderBy('o.id', 'DESC');

    if (filters.status) {
      qb.andWhere('o.status = :status', { status: filters.status });
    }
    if (filters.q?.trim()) {
      const q = `%${filters.q.trim()}%`;
      qb.andWhere(
        '(o.orderNumber ILIKE :q OR patient.fullName ILIKE :q OR patient.phone ILIKE :q OR patient.nationalId ILIKE :q OR samples.barcode ILIKE :q)',
        { q },
      );
    }
    if (filters.dateFrom) {
      qb.andWhere('o.registeredAt >= :dateFrom', { dateFrom: new Date(filters.dateFrom) });
    }
    if (filters.dateTo) {
      qb.andWhere('o.registeredAt <= :dateTo', { dateTo: new Date(filters.dateTo) });
    }

    const rawRows = await qb.getRawMany<{
      orderId: string;
      registeredAt: Date;
      labId: string;
      labName: string | null;
      patientId: string;
      patientName: string | null;
      patientPhone: string | null;
    }>();

    const dedupByPhone = new Map<string, RecipientCandidate>();
    let phonesWithValueCount = 0;
    let phonesWithoutValueCount = 0;

    for (const raw of rawRows) {
      const phoneRaw = String(raw.patientPhone ?? '').trim();
      if (!phoneRaw) {
        phonesWithoutValueCount += 1;
        continue;
      }
      phonesWithValueCount += 1;
      const phoneNormalized = this.normalizePhoneDigits(phoneRaw);
      if (!phoneNormalized) continue;
      if (dedupByPhone.has(phoneNormalized)) continue;

      dedupByPhone.set(phoneNormalized, {
        orderId: raw.orderId,
        patientId: raw.patientId,
        labId: raw.labId,
        labName: raw.labName ?? 'Laboratory',
        patientName: raw.patientName ?? null,
        phoneRaw,
        phoneNormalized,
        registeredAt: new Date(raw.registeredAt),
      });
    }

    const uniqueCandidates = Array.from(dedupByPhone.values());
    const finalCandidates = uniqueCandidates.filter(
      (candidate) => !excludedSet.has(candidate.phoneNormalized),
    );
    const excludedCount = uniqueCandidates.length - finalCandidates.length;

    return {
      matchedOrdersCount: rawRows.length,
      phonesWithValueCount,
      phonesWithoutValueCount,
      uniquePhonesCount: uniqueCandidates.length,
      excludedCount,
      finalCandidates,
    };
  }

  private renderTemplate(
    template: string,
    vars: {
      patientName: string | null;
      labName: string | null;
    },
  ): string {
    const patientName = (vars.patientName ?? '').trim() || 'Patient';
    const labName = (vars.labName ?? '').trim() || 'Laboratory';

    return String(template ?? '')
      .replace(/\{\{\s*patientName\s*\}\}/g, patientName)
      .replace(/\{\{\s*labName\s*\}\}/g, labName)
      .trim();
  }

  private normalizeFilters(input: BulkMessagingFilterInput): BulkMessagingFilterInput {
    const labId = this.normalizeOptionalUuid(input.labId, 'labId');
    if (!labId) throw new BadRequestException('labId is required');

    const status = this.normalizeOptionalOrderStatus(input.status);
    const q = input.q?.trim() || undefined;
    const dateFrom = this.normalizeOptionalDate(input.dateFrom, 'dateFrom');
    const dateTo = this.normalizeOptionalDate(input.dateTo, 'dateTo');
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom cannot be after dateTo');
    }

    return {
      labId,
      status: status ?? undefined,
      q,
      dateFrom: dateFrom ? dateFrom.toISOString() : undefined,
      dateTo: dateTo ? dateTo.toISOString() : undefined,
    };
  }

  private normalizeConfigPatches(
    channels: Record<string, unknown> | undefined,
  ): Array<{ channel: MarketingChannel; patch: ChannelConfigPatch }> {
    if (!channels || typeof channels !== 'object') {
      throw new BadRequestException('channels must be an object');
    }

    const result: Array<{ channel: MarketingChannel; patch: ChannelConfigPatch }> = [];
    for (const [rawChannel, rawPatch] of Object.entries(channels)) {
      const channel = this.normalizeChannel(rawChannel);
      if (!rawPatch || typeof rawPatch !== 'object' || Array.isArray(rawPatch)) {
        throw new BadRequestException(`channels.${channel} must be an object`);
      }
      const patch: ChannelConfigPatch = {};

      if ('enabled' in rawPatch) {
        if (typeof rawPatch.enabled !== 'boolean') {
          throw new BadRequestException(`channels.${channel}.enabled must be boolean`);
        }
        patch.enabled = rawPatch.enabled;
      }

      if ('webhookUrl' in rawPatch) {
        patch.webhookUrl = this.normalizeWebhookUrl(rawPatch.webhookUrl, `channels.${channel}.webhookUrl`);
      }

      if ('authToken' in rawPatch) {
        patch.authToken = this.normalizeOptionalText(rawPatch.authToken, `channels.${channel}.authToken`, 512);
      }

      if ('senderLabel' in rawPatch) {
        patch.senderLabel = this.normalizeOptionalText(rawPatch.senderLabel, `channels.${channel}.senderLabel`, 120);
      }

      if ('timeoutMs' in rawPatch) {
        patch.timeoutMs = this.normalizeInteger(rawPatch.timeoutMs, `channels.${channel}.timeoutMs`, 1000, 60_000);
      }

      if ('maxRetries' in rawPatch) {
        patch.maxRetries = this.normalizeInteger(rawPatch.maxRetries, `channels.${channel}.maxRetries`, 0, 5);
      }

      if (Object.keys(patch).length === 0) {
        throw new BadRequestException(`channels.${channel} patch is empty`);
      }

      result.push({ channel, patch });
    }

    if (result.length === 0) {
      throw new BadRequestException('channels payload is empty');
    }
    return result;
  }

  private normalizeTemplateUpdates(
    templates: Record<string, string | null | undefined> | undefined,
  ): Array<{ channel: MarketingChannel; templateText: string }> {
    if (!templates || typeof templates !== 'object') {
      throw new BadRequestException('templates must be an object');
    }

    const updates: Array<{ channel: MarketingChannel; templateText: string }> = [];
    for (const [rawChannel, rawText] of Object.entries(templates)) {
      const channel = this.normalizeChannel(rawChannel);
      if (rawText === null || rawText === undefined) {
        updates.push({ channel, templateText: '' });
        continue;
      }
      if (typeof rawText !== 'string') {
        throw new BadRequestException(`templates.${channel} must be a string`);
      }
      const value = rawText.trim();
      if (value.length > 2000) {
        throw new BadRequestException(`templates.${channel} must be at most 2000 characters`);
      }
      updates.push({ channel, templateText: value });
    }
    return updates;
  }

  private normalizeTemplateOverrideMap(
    overrides: Record<string, string | null | undefined> | null | undefined,
  ): Map<MarketingChannel, string> {
    const result = new Map<MarketingChannel, string>();
    if (!overrides) return result;
    if (typeof overrides !== 'object' || Array.isArray(overrides)) {
      throw new BadRequestException('templateOverrides must be an object');
    }

    for (const [rawChannel, rawText] of Object.entries(overrides)) {
      const channel = this.normalizeChannel(rawChannel);
      if (rawText === null || rawText === undefined) continue;
      if (typeof rawText !== 'string') {
        throw new BadRequestException(`templateOverrides.${channel} must be a string`);
      }
      const value = rawText.trim();
      if (value.length > 2000) {
        throw new BadRequestException(`templateOverrides.${channel} must be at most 2000 characters`);
      }
      result.set(channel, value);
    }
    return result;
  }

  private normalizeExcludedPhones(value: string[] | string | null | undefined): Set<string> {
    if (value === null || value === undefined) return new Set();
    const items: string[] = Array.isArray(value)
      ? value
      : String(value)
        .split(/[\n,;\s]+/g)
        .map((item) => item.trim())
        .filter(Boolean);

    const set = new Set<string>();
    for (const item of items) {
      const normalized = this.normalizePhoneDigits(item);
      if (normalized) set.add(normalized);
    }
    return set;
  }

  private normalizePhoneDigits(value: string): string {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length < 7 || digits.length > 20) return '';
    return digits;
  }

  private normalizeChannel(value: string): MarketingChannel {
    const normalized = String(value ?? '').trim().toUpperCase();
    const match = CHANNELS.find((item) => item === normalized);
    if (!match) {
      throw new BadRequestException(`Unsupported channel: ${value}`);
    }
    return match;
  }

  private normalizeOptionalChannel(value: string | undefined): MarketingChannel | undefined {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    return this.normalizeChannel(value);
  }

  private normalizeChannelArray(value: unknown, fieldName: string): MarketingChannel[] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new BadRequestException(`${fieldName} must be a non-empty array`);
    }
    const channels: MarketingChannel[] = [];
    for (const item of value) {
      channels.push(this.normalizeChannel(String(item)));
    }
    return Array.from(new Set(channels));
  }

  private normalizeOptionalDate(value: unknown, fieldName: string): Date | undefined {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }
    return date;
  }

  private normalizeOptionalUuid(value: unknown, fieldName: string): string | undefined {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    const text = String(value).trim();
    this.requireUuid(text, fieldName);
    return text;
  }

  private normalizeOptionalOrderStatus(value: unknown): OrderStatus | undefined {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    const text = String(value).trim().toUpperCase();
    if (!Object.values(OrderStatus).includes(text as OrderStatus)) {
      throw new BadRequestException('status is invalid');
    }
    return text as OrderStatus;
  }

  private normalizeOptionalBatchStatus(value: unknown): MarketingMessageBatchStatus | undefined {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    const text = String(value).trim().toUpperCase();
    if (!Object.values(MarketingMessageBatchStatus).includes(text as MarketingMessageBatchStatus)) {
      throw new BadRequestException('status is invalid');
    }
    return text as MarketingMessageBatchStatus;
  }

  private normalizeOptionalRecipientStatus(value: unknown): MarketingMessageRecipientStatus | undefined {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    const text = String(value).trim().toUpperCase();
    if (!Object.values(MarketingMessageRecipientStatus).includes(text as MarketingMessageRecipientStatus)) {
      throw new BadRequestException('recipient status is invalid');
    }
    return text as MarketingMessageRecipientStatus;
  }

  private normalizeWebhookUrl(value: unknown, fieldName: string): string | null {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be a string`);
    }
    const trimmed = value.trim();
    if (trimmed.length > 512) {
      throw new BadRequestException(`${fieldName} exceeds max length`);
    }
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new BadRequestException(`${fieldName} must be a valid URL`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException(`${fieldName} must use http or https`);
    }
    return trimmed;
  }

  private normalizeOptionalText(
    value: unknown,
    fieldName: string,
    maxLength: number,
  ): string | null {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be a string`);
    }
    const trimmed = value.trim();
    if (trimmed.length > maxLength) {
      throw new BadRequestException(`${fieldName} must be at most ${maxLength} chars`);
    }
    return trimmed;
  }

  private normalizeInteger(
    value: unknown,
    fieldName: string,
    min: number,
    max: number,
  ): number {
    const numeric = Number(value);
    if (!Number.isInteger(numeric)) {
      throw new BadRequestException(`${fieldName} must be an integer`);
    }
    if (numeric < min || numeric > max) {
      throw new BadRequestException(`${fieldName} must be between ${min} and ${max}`);
    }
    return numeric;
  }

  private clampInteger(
    value: unknown,
    min: number,
    max: number,
    fallback: number,
  ): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, Math.round(numeric)));
  }

  private requireUuid(value: string, fieldName: string): void {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(value)) {
      throw new BadRequestException(`${fieldName} must be a valid UUID`);
    }
  }

  private async ensureLabExists(repo: Repository<Lab>, labId: string): Promise<void> {
    const exists = await repo.exist({ where: { id: labId } });
    if (!exists) {
      throw new NotFoundException('Lab not found');
    }
  }

  private toConfigResponse(
    labId: string,
    rows: LabMessagingChannelConfig[],
  ): {
    labId: string;
    channels: Record<string, {
      enabled: boolean;
      webhookUrl: string | null;
      hasAuthToken: boolean;
      senderLabel: string | null;
      timeoutMs: number;
      maxRetries: number;
      updatedAt: string | null;
    }>;
  } {
    const map: Record<string, {
      enabled: boolean;
      webhookUrl: string | null;
      hasAuthToken: boolean;
      senderLabel: string | null;
      timeoutMs: number;
      maxRetries: number;
      updatedAt: string | null;
    }> = {};

    const byChannel = new Map(rows.map((row) => [row.channel, row]));
    for (const channel of CHANNELS) {
      const row = byChannel.get(channel);
      map[channel] = {
        enabled: row?.enabled ?? false,
        webhookUrl: row?.webhookUrl ?? null,
        hasAuthToken: Boolean(row?.authToken?.trim()),
        senderLabel: row?.senderLabel ?? null,
        timeoutMs: row?.timeoutMs ?? DEFAULT_CHANNEL_TIMEOUT_MS,
        maxRetries: row?.maxRetries ?? DEFAULT_CHANNEL_MAX_RETRIES,
        updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
      };
    }
    return { labId, channels: map };
  }

  private toTemplatesResponse(
    labId: string,
    rows: LabMarketingTemplate[],
  ): {
    labId: string;
    templates: Record<string, { templateText: string; updatedAt: string | null }>;
  } {
    const map: Record<string, { templateText: string; updatedAt: string | null }> = {};
    const byChannel = new Map(rows.map((row) => [row.channel, row]));
    for (const channel of CHANNELS) {
      const row = byChannel.get(channel);
      map[channel] = {
        templateText: row?.templateText ?? '',
        updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
      };
    }
    return { labId, templates: map };
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
