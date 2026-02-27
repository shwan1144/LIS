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
    let shouldResetRole = false;
    let ownsAutoTransaction = false;
    let queryFailed = false;

    const ensureContext = async (query: string): Promise<void> => {
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

    const patchedQuery = (async (
      query: string,
      parameters?: any[],
      useStructuredResult?: true,
    ): Promise<unknown> => {
      try {
        await ensureContext(query);
        if (useStructuredResult === true) {
          return await originalQuery(query, parameters, true);
        }
        return await originalQuery(query, parameters);
      } catch (error) {
        queryFailed = true;
        throw error;
      }
    }) as QueryRunner['query'];
    runner.query = patchedQuery;

    runner.release = async (): Promise<void> => {
      let pendingError: unknown = null;
      try {
        if (shouldResetRole) {
          await this.rlsSessionService.resetRequestContextWithExecutor(rawExecutor);
        }
      } catch (error) {
        pendingError = error;
      }

      try {
        if (ownsAutoTransaction && runner.isTransactionActive) {
          if (queryFailed) {
            await runner.rollbackTransaction();
          } else {
            await runner.commitTransaction();
          }
        }
      } catch (error) {
        if (!pendingError) {
          pendingError = error;
        }
      }

      try {
        if (runner.isTransactionActive) {
          await runner.rollbackTransaction();
        }
      } catch (error) {
        if (!pendingError) {
          pendingError = error;
        }
      } finally {
        await originalRelease();
      }

      if (pendingError) {
        throw pendingError;
      }
    };
  }

  private async applyAutomaticRequestContext(
    runner: QueryRunner,
    executeQuery: (query: string, parameters?: unknown[]) => Promise<unknown>,
  ): Promise<{ shouldResetRole: boolean; ownsAutoTransaction: boolean }> {
    const runnerData = (runner as QueryRunner & { data?: Record<string, unknown> }).data ?? {};
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

  private isTransactionControlStatement(query: string): boolean {
    const normalized = this.normalizeSql(query);
    if (!normalized) {
      return false;
    }

    return (
      normalized === 'BEGIN'
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
      || normalized.startsWith('SET SESSION CHARACTERISTICS AS TRANSACTION')
    );
  }

  private normalizeSql(query: string): string {
    const stripped = query.replace(
      /^\s*(?:(?:--[^\n]*\n)\s*|(?:\/\*[\s\S]*?\*\/)\s*)*/,
      '',
    );
    return stripped.trim().replace(/\s+/g, ' ').toUpperCase();
  }
}
