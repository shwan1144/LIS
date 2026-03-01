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
var RlsQueryRunnerEnforcerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RlsQueryRunnerEnforcerService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const request_rls_context_service_1 = require("./request-rls-context.service");
const rls_session_service_1 = require("./rls-session.service");
const security_env_1 = require("../config/security-env");
let RlsQueryRunnerEnforcerService = RlsQueryRunnerEnforcerService_1 = class RlsQueryRunnerEnforcerService {
    constructor(dataSource, requestRlsContextService, rlsSessionService) {
        this.dataSource = dataSource;
        this.requestRlsContextService = requestRlsContextService;
        this.rlsSessionService = rlsSessionService;
        this.logger = new common_1.Logger(RlsQueryRunnerEnforcerService_1.name);
        this.strictRlsMode = (0, security_env_1.isRlsStrictModeEnabled)();
        this.patchedRunners = new WeakSet();
        this.dataSourcePatched = false;
    }
    onModuleInit() {
        this.patchDataSourceCreateQueryRunner();
    }
    patchDataSourceCreateQueryRunner() {
        if (this.dataSourcePatched) {
            return;
        }
        this.dataSourcePatched = true;
        const originalCreateQueryRunner = this.dataSource.createQueryRunner.bind(this.dataSource);
        const patchedCreateQueryRunner = (mode) => {
            const runner = originalCreateQueryRunner(mode);
            this.patchQueryRunner(runner);
            return runner;
        };
        this.dataSource.createQueryRunner = patchedCreateQueryRunner;
        this.logger.log('Automatic DB request context enforcement is enabled.');
    }
    patchQueryRunner(runner) {
        if (this.patchedRunners.has(runner)) {
            return;
        }
        this.patchedRunners.add(runner);
        const originalQuery = runner.query.bind(runner);
        const originalRelease = runner.release.bind(runner);
        const rawExecutor = (query, parameters) => originalQuery(query, parameters);
        let contextPrepared = false;
        let shouldResetRole = false;
        let ownsAutoTransaction = false;
        let queryFailed = false;
        const ensureContext = async (query) => {
            if (contextPrepared) {
                return;
            }
            if (this.isTransactionControlStatement(query)) {
                return;
            }
            contextPrepared = true;
            const applyResult = await this.applyAutomaticRequestContext(runner, rawExecutor);
            shouldResetRole = applyResult.shouldResetRole;
            ownsAutoTransaction = applyResult.ownsAutoTransaction;
        };
        const patchedQuery = (async (query, parameters, useStructuredResult) => {
            try {
                await ensureContext(query);
                if (useStructuredResult === true) {
                    return await originalQuery(query, parameters, true);
                }
                return await originalQuery(query, parameters);
            }
            catch (error) {
                queryFailed = true;
                throw error;
            }
        });
        runner.query = patchedQuery;
        runner.release = async () => {
            let pendingError = null;
            try {
                if (shouldResetRole) {
                    await this.rlsSessionService.resetRequestContextWithExecutor(rawExecutor);
                }
            }
            catch (error) {
                pendingError = error;
            }
            try {
                if (ownsAutoTransaction && runner.isTransactionActive) {
                    if (queryFailed) {
                        await runner.rollbackTransaction();
                    }
                    else {
                        await runner.commitTransaction();
                    }
                }
            }
            catch (error) {
                if (!pendingError) {
                    pendingError = error;
                }
            }
            try {
                if (runner.isTransactionActive) {
                    await runner.rollbackTransaction();
                }
            }
            catch (error) {
                if (!pendingError) {
                    pendingError = error;
                }
            }
            finally {
                await originalRelease();
            }
            if (pendingError) {
                throw pendingError;
            }
        };
    }
    async applyAutomaticRequestContext(runner, executeQuery) {
        const runnerData = runner.data ?? {};
        if (runnerData.skipAutomaticRlsContext === true) {
            return { shouldResetRole: false, ownsAutoTransaction: false };
        }
        const context = this.requestRlsContextService.getContext();
        if (context.scope === 'none') {
            return { shouldResetRole: false, ownsAutoTransaction: false };
        }
        if (context.scope === 'lab' && !context.labId) {
            const message = 'Skipped automatic lab RLS context: lab scope is missing labId.';
            if (this.strictRlsMode) {
                throw new Error(`[SECURITY][RLS] ${message}`);
            }
            this.logger.warn(message);
            return { shouldResetRole: false, ownsAutoTransaction: false };
        }
        let ownsAutoTransaction = false;
        if (!runner.isTransactionActive) {
            await runner.startTransaction();
            ownsAutoTransaction = true;
        }
        await this.rlsSessionService.applyRequestContextWithExecutor(executeQuery, context);
        return { shouldResetRole: true, ownsAutoTransaction };
    }
    isTransactionControlStatement(query) {
        const normalized = this.normalizeSql(query);
        if (!normalized) {
            return false;
        }
        return (normalized === 'BEGIN'
            || normalized.startsWith('BEGIN ')
            || normalized.startsWith('START TRANSACTION')
            || normalized === 'COMMIT'
            || normalized.startsWith('COMMIT ')
            || normalized === 'ROLLBACK'
            || normalized.startsWith('ROLLBACK ')
            || normalized.startsWith('SAVEPOINT ')
            || normalized.startsWith('RELEASE SAVEPOINT')
            || normalized.startsWith('ROLLBACK TO SAVEPOINT')
            || normalized.startsWith('SET TRANSACTION')
            || normalized.startsWith('SET SESSION CHARACTERISTICS AS TRANSACTION'));
    }
    normalizeSql(query) {
        const stripped = query.replace(/^\s*(?:(?:--[^\n]*\n)\s*|(?:\/\*[\s\S]*?\*\/)\s*)*/, '');
        return stripped.trim().replace(/\s+/g, ' ').toUpperCase();
    }
};
exports.RlsQueryRunnerEnforcerService = RlsQueryRunnerEnforcerService;
exports.RlsQueryRunnerEnforcerService = RlsQueryRunnerEnforcerService = RlsQueryRunnerEnforcerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        request_rls_context_service_1.RequestRlsContextService,
        rls_session_service_1.RlsSessionService])
], RlsQueryRunnerEnforcerService);
//# sourceMappingURL=rls-query-runner-enforcer.service.js.map