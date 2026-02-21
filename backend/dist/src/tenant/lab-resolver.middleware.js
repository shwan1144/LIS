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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LabResolverMiddleware = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const lab_entity_1 = require("../entities/lab.entity");
const host_scope_enum_1 = require("./host-scope.enum");
let LabResolverMiddleware = class LabResolverMiddleware {
    constructor(labRepo) {
        this.labRepo = labRepo;
    }
    async use(req, _res, next) {
        const host = this.normalizeHost(this.extractHost(req));
        const originHost = this.normalizeHost(this.extractOriginHost(req));
        req.tenantHost = host;
        req.hostScope = host_scope_enum_1.HostScope.UNKNOWN;
        req.tenantSubdomain = null;
        req.lab = null;
        req.labId = null;
        const adminHost = this.getAdminHost();
        if (host === adminHost) {
            req.hostScope = host_scope_enum_1.HostScope.ADMIN;
            next();
            return;
        }
        let subdomain = this.extractLabSubdomain(host);
        if (subdomain === 'api' && originHost) {
            if (originHost === adminHost) {
                req.hostScope = host_scope_enum_1.HostScope.ADMIN;
                req.tenantHost = originHost;
                next();
                return;
            }
            const originSubdomain = this.extractLabSubdomain(originHost);
            if (originSubdomain) {
                subdomain = originSubdomain;
                req.tenantHost = originHost;
            }
        }
        if (!subdomain) {
            next();
            return;
        }
        const lab = await this.labRepo.findOne({
            where: [{ subdomain }, { code: subdomain.toUpperCase() }],
        });
        if (!lab) {
            throw new common_1.NotFoundException('Laboratory not found for this subdomain');
        }
        if (!lab.isActive) {
            throw new common_1.ForbiddenException('Laboratory is disabled');
        }
        req.hostScope = host_scope_enum_1.HostScope.LAB;
        req.tenantSubdomain = subdomain;
        req.lab = lab;
        req.labId = lab.id;
        next();
    }
    extractHost(req) {
        const forwardedHost = req.headers['x-forwarded-host'];
        if (typeof forwardedHost === 'string' && forwardedHost.trim()) {
            return forwardedHost.trim().split(',')[0]?.trim() ?? req.hostname;
        }
        if (Array.isArray(forwardedHost) && forwardedHost.length > 0) {
            return forwardedHost[0] ?? req.hostname;
        }
        return req.hostname || '';
    }
    normalizeHost(host) {
        return host.toLowerCase().replace(/:\d+$/, '');
    }
    extractOriginHost(req) {
        const origin = req.headers.origin;
        if (typeof origin === 'string' && origin.trim()) {
            try {
                return new URL(origin).host;
            }
            catch {
                return '';
            }
        }
        const referer = req.headers.referer;
        if (typeof referer === 'string' && referer.trim()) {
            try {
                return new URL(referer).host;
            }
            catch {
                return '';
            }
        }
        return '';
    }
    getAdminHost() {
        const explicit = (process.env.APP_ADMIN_HOST || '').trim().toLowerCase();
        if (explicit)
            return explicit;
        const base = (process.env.APP_BASE_DOMAIN || '').trim().toLowerCase();
        if (base)
            return `admin.${base}`;
        return 'admin.localhost';
    }
    extractLabSubdomain(host) {
        if (!host)
            return null;
        const adminHost = this.getAdminHost();
        if (host === adminHost)
            return null;
        if (host.endsWith('.localhost')) {
            const sub = host.split('.')[0];
            return sub && sub !== 'admin' ? sub : null;
        }
        const baseDomain = (process.env.APP_BASE_DOMAIN || '').trim().toLowerCase();
        if (baseDomain && host.endsWith(`.${baseDomain}`)) {
            const sub = host.slice(0, host.length - (`.${baseDomain}`).length);
            if (!sub || sub === 'admin' || sub.includes('.'))
                return null;
            return sub;
        }
        return null;
    }
};
exports.LabResolverMiddleware = LabResolverMiddleware;
exports.LabResolverMiddleware = LabResolverMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(lab_entity_1.Lab)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], LabResolverMiddleware);
//# sourceMappingURL=lab-resolver.middleware.js.map