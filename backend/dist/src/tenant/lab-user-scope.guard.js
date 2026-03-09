"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LabUserScopeGuard = void 0;
const common_1 = require("@nestjs/common");
const host_scope_enum_1 = require("./host-scope.enum");
let LabUserScopeGuard = class LabUserScopeGuard {
    canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const path = req.path || req.originalUrl || '';
        if (path.startsWith('/admin'))
            return true;
        if (!req.user)
            return true;
        const tokenLabId = req.user?.labId;
        if (!tokenLabId)
            return true;
        if (req.hostScope !== host_scope_enum_1.HostScope.LAB || !req.labId) {
            throw new common_1.ForbiddenException('Lab host scope required');
        }
        if (req.labId !== tokenLabId) {
            throw new common_1.ForbiddenException('Token lab context mismatch');
        }
        return true;
    }
};
exports.LabUserScopeGuard = LabUserScopeGuard;
exports.LabUserScopeGuard = LabUserScopeGuard = __decorate([
    (0, common_1.Injectable)()
], LabUserScopeGuard);
//# sourceMappingURL=lab-user-scope.guard.js.map