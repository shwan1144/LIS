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
var BulkMessagingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BulkMessagingService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const audit_service_1 = require("../audit/audit.service");
const rls_session_service_1 = require("../database/rls-session.service");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const lab_entity_1 = require("../entities/lab.entity");
const marketing_message_entity_1 = require("../entities/marketing-message.entity");
const order_entity_1 = require("../entities/order.entity");
const CHANNELS = [
    marketing_message_entity_1.MarketingChannel.WHATSAPP,
    marketing_message_entity_1.MarketingChannel.VIBER,
    marketing_message_entity_1.MarketingChannel.SMS,
];
const MAX_BATCH_UNIQUE_PHONES = 5000;
const DEFAULT_CHANNEL_TIMEOUT_MS = 10_000;
const DEFAULT_CHANNEL_MAX_RETRIES = 2;
let BulkMessagingService = BulkMessagingService_1 = class BulkMessagingService {
    constructor(labRepo, orderRepo, channelConfigRepo, templateRepo, batchRepo, recipientRepo, rlsSessionService, auditService) {
        this.labRepo = labRepo;
        this.orderRepo = orderRepo;
        this.channelConfigRepo = channelConfigRepo;
        this.templateRepo = templateRepo;
        this.batchRepo = batchRepo;
        this.recipientRepo = recipientRepo;
        this.rlsSessionService = rlsSessionService;
        this.auditService = auditService;
        this.logger = new common_1.Logger(BulkMessagingService_1.name);
        this.pollIntervalMs = 3000;
        this.staleRunningMs = 30 * 60 * 1000;
        this.maxBatchUniquePhones = MAX_BATCH_UNIQUE_PHONES;
        this.pollTimer = null;
        this.polling = false;
    }
    onModuleInit() {
        const env = (process.env.NODE_ENV || '').toLowerCase();
        if (env === 'test')
            return;
        this.pollTimer = setInterval(() => {
            void this.pollQueue();
        }, this.pollIntervalMs);
    }
    onModuleDestroy() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }
    async getLabConfig(labId) {
        this.requireUuid(labId, 'labId');
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            await this.ensureLabExists(manager.getRepository(lab_entity_1.Lab), labId);
            const rows = await manager.getRepository(marketing_message_entity_1.LabMessagingChannelConfig).find({
                where: { labId },
            });
            return this.toConfigResponse(labId, rows);
        });
    }
    async updateLabConfig(labId, body, actor) {
        this.requireUuid(labId, 'labId');
        const channelPatches = this.normalizeConfigPatches(body?.channels);
        const response = await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            await this.ensureLabExists(manager.getRepository(lab_entity_1.Lab), labId);
            const repo = manager.getRepository(marketing_message_entity_1.LabMessagingChannelConfig);
            const existing = await repo.find({
                where: { labId, channel: (0, typeorm_2.In)(channelPatches.map((item) => item.channel)) },
            });
            const existingByChannel = new Map(existing.map((item) => [item.channel, item]));
            for (const item of channelPatches) {
                const current = existingByChannel.get(item.channel);
                const next = current ?? repo.create({ labId, channel: item.channel });
                if (item.patch.enabled !== undefined)
                    next.enabled = item.patch.enabled;
                if (item.patch.webhookUrl !== undefined)
                    next.webhookUrl = item.patch.webhookUrl;
                if (item.patch.authToken !== undefined)
                    next.authToken = item.patch.authToken;
                if (item.patch.senderLabel !== undefined)
                    next.senderLabel = item.patch.senderLabel;
                if (item.patch.timeoutMs !== undefined)
                    next.timeoutMs = item.patch.timeoutMs;
                if (item.patch.maxRetries !== undefined)
                    next.maxRetries = item.patch.maxRetries;
                await repo.save(next);
            }
            const rows = await repo.find({ where: { labId } });
            return this.toConfigResponse(labId, rows);
        });
        await this.auditService.log({
            actorType: actor?.platformUserId ? audit_log_entity_1.AuditActorType.PLATFORM_USER : null,
            actorId: actor?.platformUserId ?? null,
            labId,
            action: audit_log_entity_1.AuditAction.PLATFORM_BULK_MESSAGE_CONFIG_UPDATE,
            entityType: 'lab_messaging_config',
            entityId: labId,
            description: `Updated bulk messaging channel config for lab ${labId}`,
            newValues: { channels: response.channels },
            ipAddress: actor?.ipAddress ?? null,
            userAgent: actor?.userAgent ?? null,
        });
        return response;
    }
    async getLabTemplates(labId) {
        this.requireUuid(labId, 'labId');
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            await this.ensureLabExists(manager.getRepository(lab_entity_1.Lab), labId);
            const rows = await manager.getRepository(marketing_message_entity_1.LabMarketingTemplate).find({
                where: { labId },
            });
            return this.toTemplatesResponse(labId, rows);
        });
    }
    async updateLabTemplates(labId, body, actor) {
        this.requireUuid(labId, 'labId');
        const updates = this.normalizeTemplateUpdates(body?.templates);
        if (updates.length === 0) {
            throw new common_1.BadRequestException('templates payload is empty');
        }
        const response = await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            await this.ensureLabExists(manager.getRepository(lab_entity_1.Lab), labId);
            const repo = manager.getRepository(marketing_message_entity_1.LabMarketingTemplate);
            const existing = await repo.find({
                where: { labId, channel: (0, typeorm_2.In)(updates.map((item) => item.channel)) },
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
            actorType: actor?.platformUserId ? audit_log_entity_1.AuditActorType.PLATFORM_USER : null,
            actorId: actor?.platformUserId ?? null,
            labId,
            action: audit_log_entity_1.AuditAction.PLATFORM_BULK_MESSAGE_CONFIG_UPDATE,
            entityType: 'lab_marketing_template',
            entityId: labId,
            description: `Updated bulk messaging templates for lab ${labId}`,
            newValues: { templates: response.templates },
            ipAddress: actor?.ipAddress ?? null,
            userAgent: actor?.userAgent ?? null,
        });
        return response;
    }
    async preview(input) {
        const filters = this.normalizeFilters(input);
        const excludedSet = this.normalizeExcludedPhones(input.excludedPhones);
        const resolution = await this.rlsSessionService.withPlatformAdminContext(async (manager) => this.resolveScopedRecipients(manager.getRepository(order_entity_1.Order), filters, excludedSet));
        if (resolution.finalCandidates.length > this.maxBatchUniquePhones) {
            throw new common_1.BadRequestException(`Preview recipient count exceeds limit (${this.maxBatchUniquePhones}). Refine filters.`);
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
    async send(input, actor) {
        const filters = this.normalizeFilters(input);
        const excludedSet = this.normalizeExcludedPhones(input.excludedPhones);
        const channels = this.normalizeChannelArray(input.channels, 'channels');
        const templateOverrides = this.normalizeTemplateOverrideMap(input.templateOverrides);
        const result = await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const labRepo = manager.getRepository(lab_entity_1.Lab);
            const batchRepo = manager.getRepository(marketing_message_entity_1.MarketingMessageBatch);
            const recipientRepo = manager.getRepository(marketing_message_entity_1.MarketingMessageRecipient);
            const configRepo = manager.getRepository(marketing_message_entity_1.LabMessagingChannelConfig);
            const templateRepo = manager.getRepository(marketing_message_entity_1.LabMarketingTemplate);
            await this.ensureLabExists(labRepo, filters.labId);
            const resolution = await this.resolveScopedRecipients(manager.getRepository(order_entity_1.Order), filters, excludedSet);
            if (resolution.finalCandidates.length === 0) {
                throw new common_1.BadRequestException('No recipients after filtering/exclusions');
            }
            if (resolution.finalCandidates.length > this.maxBatchUniquePhones) {
                throw new common_1.BadRequestException(`Recipient count exceeds limit (${this.maxBatchUniquePhones}). Refine filters.`);
            }
            const configs = await configRepo.find({
                where: { labId: filters.labId, channel: (0, typeorm_2.In)(channels) },
            });
            const configByChannel = new Map(configs.map((item) => [item.channel, item]));
            for (const channel of channels) {
                const config = configByChannel.get(channel);
                if (!config || !config.enabled || !config.webhookUrl) {
                    throw new common_1.BadRequestException(`Channel ${channel} is not fully configured/enabled for this lab`);
                }
            }
            const templateRows = await templateRepo.find({
                where: { labId: filters.labId, channel: (0, typeorm_2.In)(channels) },
            });
            const templatesByChannel = new Map(templateRows.map((item) => [item.channel, item.templateText ?? '']));
            const batch = batchRepo.create({
                labId: filters.labId,
                createdBy: actor?.platformUserId ?? null,
                status: marketing_message_entity_1.MarketingMessageBatchStatus.QUEUED,
                channels,
                scope: {
                    ...filters,
                    dedupe: 'unique_phone',
                },
                excludedPhones: Array.from(excludedSet),
            });
            await batchRepo.save(batch);
            const recipientRows = [];
            for (const candidate of resolution.finalCandidates) {
                for (const channel of channels) {
                    const baseTemplate = templateOverrides.get(channel) ??
                        templatesByChannel.get(channel) ??
                        '';
                    const messageText = this.renderTemplate(baseTemplate, {
                        patientName: candidate.patientName,
                        labName: candidate.labName,
                    });
                    if (!messageText.trim()) {
                        throw new common_1.BadRequestException(`Template is empty for channel ${channel}`);
                    }
                    recipientRows.push(recipientRepo.create({
                        batchId: batch.id,
                        labId: filters.labId,
                        channel,
                        status: marketing_message_entity_1.MarketingMessageRecipientStatus.PENDING,
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
                actorType: actor?.platformUserId ? audit_log_entity_1.AuditActorType.PLATFORM_USER : null,
                actorId: actor?.platformUserId ?? null,
                labId: filters.labId,
                action: audit_log_entity_1.AuditAction.PLATFORM_BULK_MESSAGE_SEND,
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
    async listJobs(input) {
        const page = Math.max(1, Number(input.page ?? 1));
        const size = Math.min(100, Math.max(1, Number(input.size ?? 25)));
        const status = this.normalizeOptionalBatchStatus(input.status);
        const labId = this.normalizeOptionalUuid(input.labId, 'labId');
        const dateFrom = this.normalizeOptionalDate(input.dateFrom, 'dateFrom');
        const dateTo = this.normalizeOptionalDate(input.dateTo, 'dateTo');
        if (dateFrom && dateTo && dateFrom > dateTo) {
            throw new common_1.BadRequestException('dateFrom cannot be after dateTo');
        }
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const repo = manager.getRepository(marketing_message_entity_1.MarketingMessageBatch);
            const qb = repo.createQueryBuilder('batch');
            if (labId)
                qb.andWhere('batch.labId = :labId', { labId });
            if (status)
                qb.andWhere('batch.status = :status', { status });
            if (dateFrom)
                qb.andWhere('batch.createdAt >= :dateFrom', { dateFrom });
            if (dateTo)
                qb.andWhere('batch.createdAt <= :dateTo', { dateTo });
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
    async getJobDetail(batchId, input = {}) {
        this.requireUuid(batchId, 'batchId');
        const page = Math.max(1, Number(input.page ?? 1));
        const size = Math.min(500, Math.max(1, Number(input.size ?? 100)));
        const status = this.normalizeOptionalRecipientStatus(input.status);
        const channel = this.normalizeOptionalChannel(input.channel);
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const batchRepo = manager.getRepository(marketing_message_entity_1.MarketingMessageBatch);
            const recipientRepo = manager.getRepository(marketing_message_entity_1.MarketingMessageRecipient);
            const batch = await batchRepo.findOne({ where: { id: batchId } });
            if (!batch) {
                throw new common_1.NotFoundException('Batch not found');
            }
            const qb = recipientRepo.createQueryBuilder('recipient')
                .where('recipient.batchId = :batchId', { batchId });
            if (status)
                qb.andWhere('recipient.status = :status', { status });
            if (channel)
                qb.andWhere('recipient.channel = :channel', { channel });
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
    triggerImmediatePoll() {
        setTimeout(() => {
            void this.pollQueue();
        }, 0);
    }
    async pollQueue() {
        if (this.polling)
            return;
        this.polling = true;
        try {
            await this.requeueStaleRunningBatches();
            const claimedBatchId = await this.claimNextBatch();
            if (!claimedBatchId)
                return;
            await this.processBatch(claimedBatchId);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Bulk messaging poll failed: ${message}`);
        }
        finally {
            this.polling = false;
        }
    }
    async requeueStaleRunningBatches() {
        await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            await manager.query(`
          UPDATE "marketing_message_batches"
          SET "status" = 'QUEUED',
              "updatedAt" = now(),
              "errorMessage" = COALESCE("errorMessage", 'Requeued stale running batch')
          WHERE "status" = 'RUNNING'
            AND "startedAt" IS NOT NULL
            AND "startedAt" < now() - ($1::text || ' milliseconds')::interval
        `, [String(this.staleRunningMs)]);
            return null;
        });
    }
    async claimNextBatch() {
        return this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const rows = await manager.query(`
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
        `);
            return rows[0]?.id ?? null;
        });
    }
    async processBatch(batchId) {
        const state = await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const batch = await manager.getRepository(marketing_message_entity_1.MarketingMessageBatch).findOne({
                where: { id: batchId },
            });
            if (!batch)
                return null;
            const recipients = await manager.getRepository(marketing_message_entity_1.MarketingMessageRecipient).find({
                where: { batchId, status: marketing_message_entity_1.MarketingMessageRecipientStatus.PENDING },
                order: { createdAt: 'ASC' },
            });
            const configs = await manager.getRepository(marketing_message_entity_1.LabMessagingChannelConfig).find({
                where: { labId: batch.labId, channel: (0, typeorm_2.In)(CHANNELS) },
            });
            return {
                batch,
                recipients,
                configsByChannel: new Map(configs.map((item) => [item.channel, item])),
            };
        });
        if (!state)
            return;
        const updates = [];
        for (const recipient of state.recipients) {
            const config = state.configsByChannel.get(recipient.channel);
            if (!config || !config.enabled || !config.webhookUrl) {
                updates.push({
                    id: recipient.id,
                    status: marketing_message_entity_1.MarketingMessageRecipientStatus.SKIPPED,
                    errorMessage: 'Channel disabled or webhook URL not configured',
                    lastAttemptAt: new Date(),
                });
            }
            else {
                const outcome = await this.sendWithRetry(recipient, config, state.batch.id);
                updates.push({
                    id: recipient.id,
                    status: outcome.status,
                    attemptCount: outcome.attemptCount,
                    lastAttemptAt: new Date(),
                    sentAt: outcome.status === marketing_message_entity_1.MarketingMessageRecipientStatus.SENT ? new Date() : null,
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
    async flushRecipientUpdates(updates) {
        await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            await manager.getRepository(marketing_message_entity_1.MarketingMessageRecipient).save(updates);
            return null;
        });
    }
    async finalizeBatchState(batchId, labId, createdBy) {
        await this.rlsSessionService.withPlatformAdminContext(async (manager) => {
            const rows = await manager.query(`
          SELECT "status", COUNT(*)::int AS "count"
          FROM "marketing_message_recipients"
          WHERE "batchId" = $1
          GROUP BY "status"
        `, [batchId]);
            let sentCount = 0;
            let failedCount = 0;
            let skippedCount = 0;
            for (const row of rows) {
                if (row.status === marketing_message_entity_1.MarketingMessageRecipientStatus.SENT)
                    sentCount = Number(row.count) || 0;
                if (row.status === marketing_message_entity_1.MarketingMessageRecipientStatus.FAILED)
                    failedCount = Number(row.count) || 0;
                if (row.status === marketing_message_entity_1.MarketingMessageRecipientStatus.SKIPPED)
                    skippedCount = Number(row.count) || 0;
            }
            let status = marketing_message_entity_1.MarketingMessageBatchStatus.COMPLETED;
            if (failedCount > 0 || skippedCount > 0) {
                status = sentCount > 0 || skippedCount > 0
                    ? marketing_message_entity_1.MarketingMessageBatchStatus.COMPLETED_WITH_ERRORS
                    : marketing_message_entity_1.MarketingMessageBatchStatus.FAILED;
            }
            const batchRepo = manager.getRepository(marketing_message_entity_1.MarketingMessageBatch);
            await batchRepo.update({ id: batchId }, {
                status,
                sentCount,
                failedCount,
                skippedCount,
                completedAt: new Date(),
                updatedAt: new Date(),
            });
            await this.auditService.log({
                actorType: createdBy ? audit_log_entity_1.AuditActorType.PLATFORM_USER : null,
                actorId: createdBy ?? null,
                labId,
                action: audit_log_entity_1.AuditAction.PLATFORM_BULK_MESSAGE_JOB_UPDATE,
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
    async sendWithRetry(recipient, config, batchId) {
        const maxRetries = this.clampInteger(config.maxRetries, 0, 5, DEFAULT_CHANNEL_MAX_RETRIES);
        const timeoutMs = this.clampInteger(config.timeoutMs, 1000, 60_000, DEFAULT_CHANNEL_TIMEOUT_MS);
        let attemptCount = 0;
        let lastError = null;
        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
            attemptCount += 1;
            try {
                const response = await this.postToWebhook(recipient, config, batchId, timeoutMs);
                if (response.ok) {
                    return {
                        status: marketing_message_entity_1.MarketingMessageRecipientStatus.SENT,
                        attemptCount,
                        errorMessage: null,
                    };
                }
                const responseBody = await response.text().catch(() => '');
                lastError = `Webhook response ${response.status}: ${responseBody.slice(0, 300)}`;
            }
            catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
            }
            if (attempt < maxRetries) {
                await this.delay(Math.min(5000, 1000 * (2 ** attempt)));
            }
        }
        return {
            status: marketing_message_entity_1.MarketingMessageRecipientStatus.FAILED,
            attemptCount,
            errorMessage: lastError ?? 'Unknown dispatch error',
        };
    }
    async postToWebhook(recipient, config, batchId, timeoutMs) {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (config.authToken?.trim()) {
            headers.Authorization = `Bearer ${config.authToken.trim()}`;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(config.webhookUrl, {
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
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    async resolveScopedRecipients(repo, filters, excludedSet) {
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
            qb.andWhere('(o.orderNumber ILIKE :q OR patient.fullName ILIKE :q OR patient.phone ILIKE :q OR patient.nationalId ILIKE :q OR samples.barcode ILIKE :q)', { q });
        }
        if (filters.dateFrom) {
            qb.andWhere('o.registeredAt >= :dateFrom', { dateFrom: new Date(filters.dateFrom) });
        }
        if (filters.dateTo) {
            qb.andWhere('o.registeredAt <= :dateTo', { dateTo: new Date(filters.dateTo) });
        }
        const rawRows = await qb.getRawMany();
        const dedupByPhone = new Map();
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
            if (!phoneNormalized)
                continue;
            if (dedupByPhone.has(phoneNormalized))
                continue;
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
        const finalCandidates = uniqueCandidates.filter((candidate) => !excludedSet.has(candidate.phoneNormalized));
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
    renderTemplate(template, vars) {
        const patientName = (vars.patientName ?? '').trim() || 'Patient';
        const labName = (vars.labName ?? '').trim() || 'Laboratory';
        return String(template ?? '')
            .replace(/\{\{\s*patientName\s*\}\}/g, patientName)
            .replace(/\{\{\s*labName\s*\}\}/g, labName)
            .trim();
    }
    normalizeFilters(input) {
        const labId = this.normalizeOptionalUuid(input.labId, 'labId');
        if (!labId)
            throw new common_1.BadRequestException('labId is required');
        const status = this.normalizeOptionalOrderStatus(input.status);
        const q = input.q?.trim() || undefined;
        const dateFrom = this.normalizeOptionalDate(input.dateFrom, 'dateFrom');
        const dateTo = this.normalizeOptionalDate(input.dateTo, 'dateTo');
        if (dateFrom && dateTo && dateFrom > dateTo) {
            throw new common_1.BadRequestException('dateFrom cannot be after dateTo');
        }
        return {
            labId,
            status: status ?? undefined,
            q,
            dateFrom: dateFrom ? dateFrom.toISOString() : undefined,
            dateTo: dateTo ? dateTo.toISOString() : undefined,
        };
    }
    normalizeConfigPatches(channels) {
        if (!channels || typeof channels !== 'object') {
            throw new common_1.BadRequestException('channels must be an object');
        }
        const result = [];
        for (const [rawChannel, rawPatch] of Object.entries(channels)) {
            const channel = this.normalizeChannel(rawChannel);
            if (!rawPatch || typeof rawPatch !== 'object' || Array.isArray(rawPatch)) {
                throw new common_1.BadRequestException(`channels.${channel} must be an object`);
            }
            const patch = {};
            if ('enabled' in rawPatch) {
                if (typeof rawPatch.enabled !== 'boolean') {
                    throw new common_1.BadRequestException(`channels.${channel}.enabled must be boolean`);
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
                throw new common_1.BadRequestException(`channels.${channel} patch is empty`);
            }
            result.push({ channel, patch });
        }
        if (result.length === 0) {
            throw new common_1.BadRequestException('channels payload is empty');
        }
        return result;
    }
    normalizeTemplateUpdates(templates) {
        if (!templates || typeof templates !== 'object') {
            throw new common_1.BadRequestException('templates must be an object');
        }
        const updates = [];
        for (const [rawChannel, rawText] of Object.entries(templates)) {
            const channel = this.normalizeChannel(rawChannel);
            if (rawText === null || rawText === undefined) {
                updates.push({ channel, templateText: '' });
                continue;
            }
            if (typeof rawText !== 'string') {
                throw new common_1.BadRequestException(`templates.${channel} must be a string`);
            }
            const value = rawText.trim();
            if (value.length > 2000) {
                throw new common_1.BadRequestException(`templates.${channel} must be at most 2000 characters`);
            }
            updates.push({ channel, templateText: value });
        }
        return updates;
    }
    normalizeTemplateOverrideMap(overrides) {
        const result = new Map();
        if (!overrides)
            return result;
        if (typeof overrides !== 'object' || Array.isArray(overrides)) {
            throw new common_1.BadRequestException('templateOverrides must be an object');
        }
        for (const [rawChannel, rawText] of Object.entries(overrides)) {
            const channel = this.normalizeChannel(rawChannel);
            if (rawText === null || rawText === undefined)
                continue;
            if (typeof rawText !== 'string') {
                throw new common_1.BadRequestException(`templateOverrides.${channel} must be a string`);
            }
            const value = rawText.trim();
            if (value.length > 2000) {
                throw new common_1.BadRequestException(`templateOverrides.${channel} must be at most 2000 characters`);
            }
            result.set(channel, value);
        }
        return result;
    }
    normalizeExcludedPhones(value) {
        if (value === null || value === undefined)
            return new Set();
        const items = Array.isArray(value)
            ? value
            : String(value)
                .split(/[\n,;\s]+/g)
                .map((item) => item.trim())
                .filter(Boolean);
        const set = new Set();
        for (const item of items) {
            const normalized = this.normalizePhoneDigits(item);
            if (normalized)
                set.add(normalized);
        }
        return set;
    }
    normalizePhoneDigits(value) {
        const digits = String(value ?? '').replace(/\D/g, '');
        if (!digits)
            return '';
        if (digits.length < 7 || digits.length > 20)
            return '';
        return digits;
    }
    normalizeChannel(value) {
        const normalized = String(value ?? '').trim().toUpperCase();
        const match = CHANNELS.find((item) => item === normalized);
        if (!match) {
            throw new common_1.BadRequestException(`Unsupported channel: ${value}`);
        }
        return match;
    }
    normalizeOptionalChannel(value) {
        if (value === undefined || value === null || String(value).trim() === '')
            return undefined;
        return this.normalizeChannel(value);
    }
    normalizeChannelArray(value, fieldName) {
        if (!Array.isArray(value) || value.length === 0) {
            throw new common_1.BadRequestException(`${fieldName} must be a non-empty array`);
        }
        const channels = [];
        for (const item of value) {
            channels.push(this.normalizeChannel(String(item)));
        }
        return Array.from(new Set(channels));
    }
    normalizeOptionalDate(value, fieldName) {
        if (value === undefined || value === null || String(value).trim() === '')
            return undefined;
        const date = new Date(String(value));
        if (Number.isNaN(date.getTime())) {
            throw new common_1.BadRequestException(`${fieldName} is invalid`);
        }
        return date;
    }
    normalizeOptionalUuid(value, fieldName) {
        if (value === undefined || value === null || String(value).trim() === '')
            return undefined;
        const text = String(value).trim();
        this.requireUuid(text, fieldName);
        return text;
    }
    normalizeOptionalOrderStatus(value) {
        if (value === undefined || value === null || String(value).trim() === '')
            return undefined;
        const text = String(value).trim().toUpperCase();
        if (!Object.values(order_entity_1.OrderStatus).includes(text)) {
            throw new common_1.BadRequestException('status is invalid');
        }
        return text;
    }
    normalizeOptionalBatchStatus(value) {
        if (value === undefined || value === null || String(value).trim() === '')
            return undefined;
        const text = String(value).trim().toUpperCase();
        if (!Object.values(marketing_message_entity_1.MarketingMessageBatchStatus).includes(text)) {
            throw new common_1.BadRequestException('status is invalid');
        }
        return text;
    }
    normalizeOptionalRecipientStatus(value) {
        if (value === undefined || value === null || String(value).trim() === '')
            return undefined;
        const text = String(value).trim().toUpperCase();
        if (!Object.values(marketing_message_entity_1.MarketingMessageRecipientStatus).includes(text)) {
            throw new common_1.BadRequestException('recipient status is invalid');
        }
        return text;
    }
    normalizeWebhookUrl(value, fieldName) {
        if (value === null || value === undefined || String(value).trim() === '')
            return null;
        if (typeof value !== 'string') {
            throw new common_1.BadRequestException(`${fieldName} must be a string`);
        }
        const trimmed = value.trim();
        if (trimmed.length > 512) {
            throw new common_1.BadRequestException(`${fieldName} exceeds max length`);
        }
        let parsed;
        try {
            parsed = new URL(trimmed);
        }
        catch {
            throw new common_1.BadRequestException(`${fieldName} must be a valid URL`);
        }
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new common_1.BadRequestException(`${fieldName} must use http or https`);
        }
        return trimmed;
    }
    normalizeOptionalText(value, fieldName, maxLength) {
        if (value === null || value === undefined || String(value).trim() === '')
            return null;
        if (typeof value !== 'string') {
            throw new common_1.BadRequestException(`${fieldName} must be a string`);
        }
        const trimmed = value.trim();
        if (trimmed.length > maxLength) {
            throw new common_1.BadRequestException(`${fieldName} must be at most ${maxLength} chars`);
        }
        return trimmed;
    }
    normalizeInteger(value, fieldName, min, max) {
        const numeric = Number(value);
        if (!Number.isInteger(numeric)) {
            throw new common_1.BadRequestException(`${fieldName} must be an integer`);
        }
        if (numeric < min || numeric > max) {
            throw new common_1.BadRequestException(`${fieldName} must be between ${min} and ${max}`);
        }
        return numeric;
    }
    clampInteger(value, min, max, fallback) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric))
            return fallback;
        return Math.min(max, Math.max(min, Math.round(numeric)));
    }
    requireUuid(value, fieldName) {
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidPattern.test(value)) {
            throw new common_1.BadRequestException(`${fieldName} must be a valid UUID`);
        }
    }
    async ensureLabExists(repo, labId) {
        const exists = await repo.exist({ where: { id: labId } });
        if (!exists) {
            throw new common_1.NotFoundException('Lab not found');
        }
    }
    toConfigResponse(labId, rows) {
        const map = {};
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
    toTemplatesResponse(labId, rows) {
        const map = {};
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
    toRecord(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value;
    }
    async delay(ms) {
        await new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
};
exports.BulkMessagingService = BulkMessagingService;
exports.BulkMessagingService = BulkMessagingService = BulkMessagingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(lab_entity_1.Lab)),
    __param(1, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __param(2, (0, typeorm_1.InjectRepository)(marketing_message_entity_1.LabMessagingChannelConfig)),
    __param(3, (0, typeorm_1.InjectRepository)(marketing_message_entity_1.LabMarketingTemplate)),
    __param(4, (0, typeorm_1.InjectRepository)(marketing_message_entity_1.MarketingMessageBatch)),
    __param(5, (0, typeorm_1.InjectRepository)(marketing_message_entity_1.MarketingMessageRecipient)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        rls_session_service_1.RlsSessionService,
        audit_service_1.AuditService])
], BulkMessagingService);
//# sourceMappingURL=bulk-messaging.service.js.map