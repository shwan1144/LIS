"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminHostGuard = void 0;
const common_1 = require("@nestjs/common");
const host_scope_enum_1 = require("./host-scope.enum");
let AdminHostGuard = class AdminHostGuard {
    canActivate(context) {
        const req = context.switchToHttp().getRequest();
        if (req.hostScope !== host_scope_enum_1.HostScope.ADMIN) {
            throw new common_1.ForbiddenException('Admin host required for this endpoint');
        }
        return true;
    }
};
exports.AdminHostGuard = AdminHostGuard;
exports.AdminHostGuard = AdminHostGuard = __decorate([
    (0, common_1.Injectable)()
], AdminHostGuard);
//# sourceMappingURL=admin-host.guard.js.map