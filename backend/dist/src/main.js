"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
if (!process.env.DB_PASSWORD && !process.env.DATABASE_URL) {
    require('dotenv').config();
}
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const express_1 = require("express");
const app_module_1 = require("./app.module");
const seed_1 = require("./seed");
const typeorm_1 = require("typeorm");
const bootstrapLogger = new common_1.Logger('Bootstrap');
const DEV_CORS_RULES = [
    'http://localhost:*',
    'http://127.0.0.1:*',
    'http://*.localhost:*',
    'https://localhost:*',
    'https://127.0.0.1:*',
    'https://*.localhost:*',
];
function normalizeOrigin(input) {
    const trimmed = input.trim().replace(/\/+$/, '');
    try {
        const url = new URL(trimmed);
        return `${url.protocol}//${url.host}`.toLowerCase();
    }
    catch {
        return trimmed.toLowerCase();
    }
}
function parseCorsRules() {
    const raw = (process.env.CORS_ORIGIN || '').trim();
    const baseRules = raw
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map(normalizeOrigin);
    if (baseRules.length === 0) {
        baseRules.push('http://localhost:5173');
    }
    if (process.env.NODE_ENV !== 'production') {
        for (const rule of DEV_CORS_RULES) {
            baseRules.push(normalizeOrigin(rule));
        }
    }
    return Array.from(new Set(baseRules));
}
function isOriginAllowed(origin, rules) {
    const normalizedOrigin = normalizeOrigin(origin);
    return rules.some((rule) => {
        if (rule === '*')
            return true;
        if (!rule.includes('*'))
            return normalizedOrigin === rule;
        const escaped = rule
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*');
        return new RegExp(`^${escaped}$`, 'i').test(normalizedOrigin);
    });
}
function shouldAutoSeedOnBoot() {
    if (process.env.AUTO_SEED_ON_BOOT === 'true') {
        return true;
    }
    if (process.env.AUTO_SEED_ON_BOOT === 'false') {
        return false;
    }
    return process.env.NODE_ENV === 'production';
}
async function ensureReportBrandingColumns(dataSource) {
    const sqlStatements = [
        'ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "reportBannerDataUrl" text',
        'ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "reportFooterDataUrl" text',
        'ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "reportLogoDataUrl" text',
        'ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "reportWatermarkDataUrl" text',
        'ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "onlineResultWatermarkDataUrl" text',
        'ALTER TABLE IF EXISTS "labs" ADD COLUMN IF NOT EXISTS "onlineResultWatermarkText" varchar(120)',
    ];
    for (const sql of sqlStatements) {
        await dataSource.query(sql);
    }
}
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.use((0, express_1.json)({ limit: '10mb' }));
    app.use((0, express_1.urlencoded)({ extended: true, limit: '10mb' }));
    const dataSource = app.get(typeorm_1.DataSource);
    try {
        await ensureReportBrandingColumns(dataSource);
    }
    catch (error) {
        bootstrapLogger.warn(`Failed to auto-ensure report branding columns: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (shouldAutoSeedOnBoot()) {
        await (0, seed_1.runSeed)({ synchronizeSchema: false });
    }
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    const corsRules = parseCorsRules();
    bootstrapLogger.log(`CORS rules: ${corsRules.join(', ')}`);
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin) {
                callback(null, true);
                return;
            }
            if (isOriginAllowed(origin, corsRules)) {
                callback(null, true);
                return;
            }
            callback(new Error(`Not allowed by CORS: ${origin}`));
        },
        credentials: true,
    });
    await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
//# sourceMappingURL=main.js.map