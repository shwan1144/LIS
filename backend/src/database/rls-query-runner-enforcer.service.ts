import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { RequestRlsContextService } from './request-rls-context.service';
import { RlsSessionService } from './rls-session.service';
import { isRlsStrictModeEnabled } from '../config/security-env';

type RawQueryExecutor = (
  query: string,
  parameters?: unknown[],
) => Promise<unknown>;

@Injectable()
export class RlsQueryRunnerEnforcerService implements OnModuleInit {
  private readonly logger = new Logger(RlsQueryRunnerEnforcerService.name);
  private readonly strictRlsMode = isRlsStrictModeEnabled();
  private readonly patchedRunners = new WeakSet<QueryRunner>();
  private dataSourcePatched = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly requestRlsContextService: RequestRlsContextService,
    private readonly rlsSessionService: RlsSessionService,
  ) {}

  onModuleInit(): void {
    this.patchDataSourceCreateQueryRunner();
  }

  private patchDataSourceCreateQueryRunner(): void {
    if (this.dataSourcePatched) {
      return;
    }
    this.dataSourcePatched = true;

    const originalCreateQueryRunner = this.dataSource.createQueryRunner.bind(this.dataSource);
    const patchedCreateQueryRunner: DataSource['createQueryRunner'] = (
      mode?: 'master' | 'slave',
    ): QueryRunner => {
      const runner = originalCreateQueryRunner(mode);
      this.patchQueryRunner(runner);
      return runner;
    };

    this.dataSource.createQueryRunner = patchedCreateQueryRunner;
    this.logger.log('Automatic DB request context enforcement is enabled.');
  }

  private patchQueryRunner(runner: QueryRunner): void {
    if (this.patchedRunners.has(runner)) {
      return;
    }
    this.patchedRunners.add(runner);

    const originalQuery = runner.query.bind(runner) as QueryRunner['query'];
    const originalRelease = runner.release.bind(runner);
    const rawExecutor = (query: string, parameters?: unknown[]): Promise<unknown> =>
      originalQuery(query, parameters as any[] | undefined);

    let contextPrepared = false;
    let shouldResetContext = false;

    const ensureContext = async (): Promise<void> => {
      if (contextPrepared) {
        return;
      }
      contextPrepared = true;
      shouldResetContext = await this.applyAutomaticRequestContext(runner, rawExecutor);
    };

    const patchedQuery = (async (
      query: string,
      parameters?: any[],
      useStructuredResult?: true,
    ): Promise<unknown> => {
      await ensureContext();
      if (useStructuredResult === true) {
        return originalQuery(query, parameters, true);
      }
      return originalQuery(query, parameters);
    }) as QueryRunner['query'];
    runner.query = patchedQuery;

    runner.release = async (): Promise<void> => {
      try {
        if (shouldResetContext) {
          await this.rlsSessionService.resetRequestContextWithExecutor(rawExecutor);
        }
      } finally {
        await originalRelease();
      }
    };
  }

  private async applyAutomaticRequestContext(
    runner: QueryRunner,
    executeQuery: (query: string, parameters?: unknown[]) => Promise<unknown>,
  ): Promise<boolean> {
    const runnerData = (runner as QueryRunner & { data?: Record<string, unknown> }).data ?? {};
    if (runnerData.skipAutomaticRlsContext === true) {
      return false;
    }

    const context = this.requestRlsContextService.getContext();
    if (context.scope === 'none') {
      return false;
    }
    if (context.scope === 'lab' && !context.labId) {
      const message = 'Skipped automatic lab RLS context: lab scope is missing labId.';
      if (this.strictRlsMode) {
        throw new Error(`[SECURITY][RLS] ${message}`);
      }
      this.logger.warn(message);
      return false;
    }

    await this.rlsSessionService.applyRequestContextWithExecutor(executeQuery, context, {
      local: false,
    });
    return true;
  }
}
