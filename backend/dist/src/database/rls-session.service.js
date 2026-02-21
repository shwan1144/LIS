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
var RlsSessionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RlsSessionService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
let RlsSessionService = RlsSessionService_1 = class RlsSessionService {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(RlsSessionService_1.name);
        this.warnedMissingRoles = new Set();
        this.warnedMembershipRoles = new Set();
        this.warnedMissingRolePrivileges = new Set();
    }
    async withLabContext(labId, execute) {
        const runner = this.dataSource.createQueryRunner();
        await runner.connect();
        await runner.startTransaction();
        try {
            await runner.query(`SELECT set_config('app.current_lab_id', $1, true)`, [labId]);
            await this.trySetLocalRole(runner, 'app_lab_user');
            const result = await execute(runner.manager);
            await runner.commitTransaction();
            return result;
        }
        catch (error) {
            await runner.rollbackTransaction();
            throw error;
        }
        finally {
            await runner.release();
        }
    }
    async withPlatformAdminContext(execute) {
        const runner = this.dataSource.createQueryRunner();
        await runner.connect();
        await runner.startTransaction();
        try {
            await runner.query(`SELECT set_config('app.current_lab_id', '', true)`);
            await this.trySetLocalRole(runner, 'app_platform_admin');
            const result = await execute(runner.manager);
            await runner.commitTransaction();
            return result;
        }
        catch (error) {
            await runner.rollbackTransaction();
            throw error;
        }
        finally {
            await runner.release();
        }
    }
    async trySetLocalRole(runner, role) {
        const safeRole = role.trim();
        if (!/^[a-z_][a-z0-9_]*$/i.test(safeRole)) {
            this.logger.warn(`Skipped invalid role identifier: ${role}`);
            return;
        }
        const status = await runner.query(`
      SELECT
        EXISTS(SELECT 1 FROM pg_roles WHERE rolname = $1) AS "roleExists",
        CASE
          WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname = $1)
            THEN pg_has_role(current_user, $1, 'MEMBER')
          ELSE false
        END AS "canSetRole"
      `, [safeRole]);
        const roleExists = Boolean(status?.[0]?.roleExists);
        const canSetRole = Boolean(status?.[0]?.canSetRole);
        if (!roleExists) {
            if (!this.warnedMissingRoles.has(safeRole)) {
                this.logger.warn(`Skipped SET LOCAL ROLE ${safeRole}: role does not exist.`);
                this.warnedMissingRoles.add(safeRole);
            }
            return;
        }
        if (!canSetRole) {
            if (!this.warnedMembershipRoles.has(safeRole)) {
                this.logger.warn(`Skipped SET LOCAL ROLE ${safeRole}: current DB user is not a member.`);
                this.warnedMembershipRoles.add(safeRole);
            }
            return;
        }
        if (safeRole === 'app_platform_admin') {
            const hasPrivilegeRows = await runner.query(`
        SELECT
          CASE
            WHEN to_regclass('public.labs') IS NULL THEN true
            ELSE has_table_privilege($1, 'public.labs', 'SELECT')
          END AS "hasLabsSelect"
        `, [safeRole]);
            const hasLabsSelect = Boolean(hasPrivilegeRows?.[0]?.hasLabsSelect);
            if (!hasLabsSelect) {
                if (!this.warnedMissingRolePrivileges.has(safeRole)) {
                    this.logger.warn(`Skipped SET LOCAL ROLE ${safeRole}: role lacks SELECT privilege on public.labs.`);
                    this.warnedMissingRolePrivileges.add(safeRole);
                }
                return;
            }
        }
        try {
            await runner.query(`SET LOCAL ROLE ${safeRole}`);
        }
        catch (error) {
            if (safeRole === 'app_platform_admin') {
                const message = error instanceof Error ? error.message : String(error);
                if (!this.warnedMissingRolePrivileges.has(`${safeRole}:set-role`)) {
                    this.logger.warn(`Skipped SET LOCAL ROLE ${safeRole}: ${message}`);
                    this.warnedMissingRolePrivileges.add(`${safeRole}:set-role`);
                }
                return;
            }
            throw error;
        }
    }
};
exports.RlsSessionService = RlsSessionService;
exports.RlsSessionService = RlsSessionService = RlsSessionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], RlsSessionService);
//# sourceMappingURL=rls-session.service.js.map