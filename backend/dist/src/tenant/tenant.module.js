"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const core_1 = require("@nestjs/core");
const lab_entity_1 = require("../entities/lab.entity");
const database_support_module_1 = require("../database/database-support.module");
const lab_resolver_middleware_1 = require("./lab-resolver.middleware");
const lab_host_guard_1 = require("./lab-host.guard");
const admin_host_guard_1 = require("./admin-host.guard");
const lab_token_context_guard_1 = require("./lab-token-context.guard");
const lab_user_scope_guard_1 = require("./lab-user-scope.guard");
const tenant_rls_context_middleware_1 = require("./tenant-rls-context.middleware");
let TenantModule = class TenantModule {
    configure(consumer) {
        consumer.apply(lab_resolver_middleware_1.LabResolverMiddleware, tenant_rls_context_middleware_1.TenantRlsContextMiddleware).forRoutes('*');
    }
};
exports.TenantModule = TenantModule;
exports.TenantModule = TenantModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([lab_entity_1.Lab]), database_support_module_1.DatabaseSupportModule],
        providers: [
            lab_resolver_middleware_1.LabResolverMiddleware,
            tenant_rls_context_middleware_1.TenantRlsContextMiddleware,
            lab_host_guard_1.LabHostGuard,
            admin_host_guard_1.AdminHostGuard,
            lab_token_context_guard_1.LabTokenContextGuard,
            lab_user_scope_guard_1.LabUserScopeGuard,
            {
                provide: core_1.APP_GUARD,
                useClass: lab_user_scope_guard_1.LabUserScopeGuard,
            },
        ],
        exports: [lab_host_guard_1.LabHostGuard, admin_host_guard_1.AdminHostGuard, lab_token_context_guard_1.LabTokenContextGuard],
    })
], TenantModule);
//# sourceMappingURL=tenant.module.js.map