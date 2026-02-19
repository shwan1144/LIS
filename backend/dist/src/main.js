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
function shouldAutoSeedOnBoot() {
    if (process.env.AUTO_SEED_ON_BOOT === 'true') {
        return true;
    }
    if (process.env.AUTO_SEED_ON_BOOT === 'false') {
        return false;
    }
    return process.env.NODE_ENV === 'production';
}
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.use((0, express_1.json)({ limit: '10mb' }));
    app.use((0, express_1.urlencoded)({ extended: true, limit: '10mb' }));
    if (shouldAutoSeedOnBoot()) {
        await (0, seed_1.runSeed)({ synchronizeSchema: false });
    }
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    app.enableCors({
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
        credentials: true,
    });
    await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
//# sourceMappingURL=main.js.map