import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { RequestRlsContext } from './request-rls-context.types';
import { isRlsStrictModeEnabled } from '../config/security-env';

type QueryExecutor = (query: string, parameters?: unknown[]) => Promise<unknown>;

@Injectable()
export class RlsSessionService {
  private readonly logger = new Logger(RlsSessionService.name);
  private readonly strictRlsMode = isRlsStrictModeEnabled();
  private readonly warnedSetRoleFailures = new Set<string>();
  private readonly warnedResetFailures = new Set<string>();

  constructor(private readonly dataSource: DataSource) {}

  async withLabContext<T>(
    labId: string,
    execute: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const runner = this.dataSource.createQueryRunner();
    this.markRunnerSkipAutoContext(runner);
    await runner.connect();
    await runner.startTransaction();
    const executeQuery = runner.query.bind(runner) as QueryExecutor;
    let pendingError: unknown = null;

    try {
      await this.applyRequestContextWithExecutor(
        executeQuery,
        { scope: 'lab', labId },
      );
      const result = await execute(runner.manager);
      await runner.commitTransaction();
      return result;
    } catch (error) {
      pendingError = error;
      throw error;
    } finally {
      pendingError = await this.resetThenFinalizeRunner(
        runner,
        executeQuery,
        pendingError,
      );
      if (pendingError) {
        throw pendingError;
      }
    }
  }

  async withPlatformAdminContext<T>(
    execute: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const runner = this.dataSource.createQueryRunner();
    this.markRunnerSkipAutoContext(runner);
    await runner.connect();
    await runner.startTransaction();
    const executeQuery = runner.query.bind(runner) as QueryExecutor;
    let pendingError: unknown = null;

    try {
      await this.applyRequestContextWithExecutor(
        executeQuery,
        { scope: 'admin', labId: null },
      );
      const result = await execute(runner.manager);
      await runner.commitTransaction();
      return result;
    } catch (error) {
      pendingError = error;
      throw error;
    } finally {
      pendingError = await this.resetThenFinalizeRunner(
        runner,
        executeQuery,
        pendingError,
      );
      if (pendingError) {
        throw pendingError;
      }
    }
  }

  async applyRequestContextWithExecutor(
    executeQuery: QueryExecutor,
    context: RequestRlsContext,
  ): Promise<boolean> {
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

  async resetRequestContextWithExecutor(executeQuery: QueryExecutor): Promise<void> {
    try {
      await executeQuery('RESET ROLE');
    } catch (error) {
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

  private markRunnerSkipAutoContext(runner: QueryRunner): void {
    const mutableRunner = runner as QueryRunner & { data?: Record<string, unknown> };
    mutableRunner.data = {
      ...(mutableRunner.data ?? {}),
      skipAutomaticRlsContext: true,
    };
  }

  private async trySetRole(
    executeQuery: QueryExecutor,
    role: string,
  ): Promise<void> {
    const safeRole = role.trim();
    if (!/^[a-z_][a-z0-9_]*$/i.test(safeRole)) {
      this.failOrWarn(
        `Invalid role identifier for RLS context: ${role}`,
        this.warnedSetRoleFailures,
      );
      return;
    }

    try {
      await executeQuery(`SET ROLE ${safeRole}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.failOrWarn(
        `Skipped SET ROLE ${safeRole}: ${message}`,
        this.warnedSetRoleFailures,
        `${safeRole}:set-role:${message}`,
      );
    }
  }

  private failOrWarn(message: string, warnedSet: Set<string>, keyOverride?: string): void {
    if (this.strictRlsMode) {
      throw new Error(`[SECURITY][RLS] ${message}`);
    }

    const key = keyOverride ?? message;
    if (!warnedSet.has(key)) {
      this.logger.warn(message);
      warnedSet.add(key);
    }
  }

  private async resetThenFinalizeRunner(
    runner: QueryRunner,
    executeQuery: QueryExecutor,
    pendingError: unknown,
  ): Promise<unknown> {
    let error = pendingError;

    try {
      await this.resetRequestContextWithExecutor(executeQuery);
    } catch (resetError) {
      if (!error) {
        error = resetError;
      }
    }

    try {
      if (runner.isTransactionActive) {
        await runner.rollbackTransaction();
      }
    } catch (rollbackError) {
      if (!error) {
        error = rollbackError;
      }
    }

    try {
      await runner.release();
    } catch (releaseError) {
      if (!error) {
        error = releaseError;
      }
    }

    return error;
  }
}
