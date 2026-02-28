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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantRlsContextMiddleware = void 0;
const common_1 = require("@nestjs/common");
const request_rls_context_service_1 = require("../database/request-rls-context.service");
const host_scope_enum_1 = require("./host-scope.enum");
let TenantRlsContextMiddleware = class TenantRlsContextMiddleware {
    constructor(requestRlsContextService) {
        this.requestRlsContextService = requestRlsContextService;
    }
    use(req, _res, next) {
        const context = this.resolveContext(req);
        this.requestRlsContextService.runWithContext(context, () => next());
    }
    resolveContext(req) {
        if (req.hostScope === host_scope_enum_1.HostScope.LAB && req.labId) {
            return { scope: 'lab', labId: req.labId };
        }
        if (req.hostScope === host_scope_enum_1.HostScope.ADMIN) {
            return { scope: 'admin', labId: null };
        }
        return { scope: 'none', labId: null };
    }
};
exports.TenantRlsContextMiddleware = TenantRlsContextMiddleware;
exports.TenantRlsContextMiddleware = TenantRlsContextMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [request_rls_context_service_1.RequestRlsContextService])
], TenantRlsContextMiddleware);
//# sourceMappingURL=tenant-rls-context.middleware.js.map