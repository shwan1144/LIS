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
const security_env_1 = require("../config/security-env");
let RlsSessionService = RlsSessionService_1 = class RlsSessionService {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(RlsSessionService_1.name);
        this.strictRlsMode = (0, security_env_1.isRlsStrictModeEnabled)();
        this.warnedSetRoleFailures = new Set();
        this.warnedResetFailures = new Set();
    }
    async withLabContext(labId, execute) {
        const runner = this.dataSource.createQueryRunner();
        this.markRunnerSkipAutoContext(runner);
        await runner.connect();
        await runner.startTransaction();
        const executeQuery = runner.query.bind(runner);
        let pendingError = null;
        try {
            await this.applyRequestContextWithExecutor(executeQuery, { scope: 'lab', labId });
            const result = await execute(runner.manager);
            await runner.commitTransaction();
            return result;
        }
        catch (error) {
            pendingError = error;
            throw error;
        }
        finally {
            pendingError = await this.resetThenFinalizeRunner(runner, executeQuery, pendingError);
            if (pendingError) {
                throw pendingError;
            }
        }
    }
    async withPlatformAdminContext(execute) {
        const runner = this.dataSource.createQueryRunner();
        this.markRunnerSkipAutoContext(runner);
        await runner.connect();
        await runner.startTransaction();
        const executeQuery = runner.query.bind(runner);
        let pendingError = null;
        try {
            await this.applyRequestContextWithExecutor(executeQuery, { scope: 'admin', labId: null });
            const result = await execute(runner.manager);
            await runner.commitTransaction();
            return result;
        }
        catch (error) {
            pendingError = error;
            throw error;
        }
        finally {
            pendingError = await this.resetThenFinalizeRunner(runner, executeQuery, pendingError);
            if (pendingError) {
                throw pendingError;
            }
        }
    }
    async applyRequestContextWithExecutor(executeQuery, context) {
        if (context.scope === 'none') {
            return false;
        }
        if (context.scope === 'lab') {
            if (!context.labId) {
                if (this.strictRlsMode) {
                    throw new Error('[SECURITY][RLS] Missing labId for lab-scoped DB context.');
                }
                return false;
            }
            await executeQuery(`SELECT set_config('app.current_lab_id', $1, true)`, [context.labId]);
            await this.trySetRole(executeQuery, 'app_lab_user');
            return true;
        }
        await executeQuery(`SELECT set_config('app.current_lab_id', $1, true)`, ['']);
        await this.trySetRole(executeQuery, 'app_platform_admin');
        return true;
    }
    async resetRequestContextWithExecutor(executeQuery) {
        try {
            await executeQuery('RESET ROLE');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const failureMessage = `Failed to reset DB request context: ${message}`;
            if (this.strictRlsMode) {
                throw new Error(`[SECURITY][RLS] ${failureMessage}`);
            }
            if (!this.warnedResetFailures.has(failureMessage)) {
                this.logger.warn(failureMessage);
                this.warnedResetFailures.add(failureMessage);
            }
        }
    }
    markRunnerSkipAutoContext(runner) {
        const mutableRunner = runner;
        mutableRunner.data = {
            ...(mutableRunner.data ?? {}),
            skipAutomaticRlsContext: true,
        };
    }
    async trySetRole(executeQuery, role) {
        const safeRole = role.trim();
        if (!/^[a-z_][a-z0-9_]*$/i.test(safeRole)) {
            this.failOrWarn(`Invalid role identifier for RLS context: ${role}`, this.warnedSetRoleFailures);
            return;
        }
        try {
            await executeQuery(`SET ROLE ${safeRole}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.failOrWarn(`Skipped SET ROLE ${safeRole}: ${message}`, this.warnedSetRoleFailures, `${safeRole}:set-role:${message}`);
        }
    }
    failOrWarn(message, warnedSet, keyOverride) {
        if (this.strictRlsMode) {
            throw new Error(`[SECURITY][RLS] ${message}`);
        }
        const key = keyOverride ?? message;
        if (!warnedSet.has(key)) {
            this.logger.warn(message);
            warnedSet.add(key);
        }
    }
    async resetThenFinalizeRunner(runner, executeQuery, pendingError) {
        let error = pendingError;
        try {
            await this.resetRequestContextWithExecutor(executeQuery);
        }
        catch (resetError) {
            if (!error) {
                error = resetError;
            }
        }
        try {
            if (runner.isTransactionActive) {
                await runner.rollbackTransaction();
            }
        }
        catch (rollbackError) {
            if (!error) {
                error = rollbackError;
            }
        }
        try {
            await runner.release();
        }
        catch (releaseError) {
            if (!error) {
                error = releaseError;
            }
        }
        return error;
    }
};
exports.RlsSessionService = RlsSessionService;
exports.RlsSessionService = RlsSessionService = RlsSessionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], RlsSessionService);
//# sourceMappingURL=rls-session.service.js.map