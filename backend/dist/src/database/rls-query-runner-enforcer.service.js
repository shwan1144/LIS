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
let RlsQueryRunnerEnforcerService = RlsQueryRunnerEnforcerService_1 = class RlsQueryRunnerEnforcerService {
    constructor(dataSource, requestRlsContextService, rlsSessionService) {
        this.dataSource = dataSource;
        this.requestRlsContextService = requestRlsContextService;
        this.rlsSessionService = rlsSessionService;
        this.logger = new common_1.Logger(RlsQueryRunnerEnforcerService_1.name);
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
        let shouldResetContext = false;
        const ensureContext = async () => {
            if (contextPrepared) {
                return;
            }
            contextPrepared = true;
            shouldResetContext = await this.applyAutomaticRequestContext(runner, rawExecutor);
        };
        const patchedQuery = (async (query, parameters, useStructuredResult) => {
            await ensureContext();
            if (useStructuredResult === true) {
                return originalQuery(query, parameters, true);
            }
            return originalQuery(query, parameters);
        });
        runner.query = patchedQuery;
        runner.release = async () => {
            try {
                if (shouldResetContext) {
                    await this.rlsSessionService.resetRequestContextWithExecutor(rawExecutor);
                }
            }
            finally {
                await originalRelease();
            }
        };
    }
    async applyAutomaticRequestContext(runner, executeQuery) {
        const runnerData = runner.data ?? {};
        if (runnerData.skipAutomaticRlsContext === true) {
            return false;
        }
        const context = this.requestRlsContextService.getContext();
        if (context.scope === 'none') {
            return false;
        }
        if (context.scope === 'lab' && !context.labId) {
            this.logger.warn('Skipped automatic lab RLS context: lab scope is missing labId.');
            return false;
        }
        await this.rlsSessionService.applyRequestContextWithExecutor(executeQuery, context, {
            local: false,
        });
        return true;
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