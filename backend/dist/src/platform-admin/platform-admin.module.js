"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformAdminModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const lab_entity_1 = require("../entities/lab.entity");
const order_entity_1 = require("../entities/order.entity");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const platform_setting_entity_1 = require("../entities/platform-setting.entity");
const marketing_message_entity_1 = require("../entities/marketing-message.entity");
const database_support_module_1 = require("../database/database-support.module");
const settings_module_1 = require("../settings/settings.module");
const reports_module_1 = require("../reports/reports.module");
const admin_auth_module_1 = require("../admin-auth/admin-auth.module");
const auth_module_1 = require("../auth/auth.module");
const platform_admin_controller_1 = require("./platform-admin.controller");
const platform_admin_service_1 = require("./platform-admin.service");
const bulk_messaging_controller_1 = require("./bulk-messaging.controller");
const bulk_messaging_service_1 = require("./bulk-messaging.service");
let PlatformAdminModule = class PlatformAdminModule {
};
exports.PlatformAdminModule = PlatformAdminModule;
exports.PlatformAdminModule = PlatformAdminModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                lab_entity_1.Lab,
                order_entity_1.Order,
                audit_log_entity_1.AuditLog,
                platform_setting_entity_1.PlatformSetting,
                marketing_message_entity_1.LabMessagingChannelConfig,
                marketing_message_entity_1.LabMarketingTemplate,
                marketing_message_entity_1.MarketingMessageBatch,
                marketing_message_entity_1.MarketingMessageRecipient,
            ]),
            database_support_module_1.DatabaseSupportModule,
            settings_module_1.SettingsModule,
            reports_module_1.ReportsModule,
            admin_auth_module_1.AdminAuthModule,
            auth_module_1.AuthModule,
        ],
        controllers: [platform_admin_controller_1.PlatformAdminController, bulk_messaging_controller_1.BulkMessagingController],
        providers: [platform_admin_service_1.PlatformAdminService, bulk_messaging_service_1.BulkMessagingService],
    })
], PlatformAdminModule);
//# sourceMappingURL=platform-admin.module.js.map