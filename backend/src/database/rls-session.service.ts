import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { RequestRlsContext } from './request-rls-context.types';
import { isRlsStrictModeEnabled } from '../config/security-env';

type QueryExecutor = (query: string, parameters?: unknown[]) => Promise<unknown>;

@Injectable()
export class RlsSessionService {
  private readonly logger = new Logger(RlsSessionService.name);
  private readonly strictRlsMode = isRlsStrictModeEnabled();
  private readonly warnedMissingRoles = new Set<string>();
  private readonly warnedMembershipRoles = new Set<string>();
  private readonly warnedMissingRolePrivileges = new Set<string>();
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

    try {
      await this.applyRequestContextWithExecutor(
        runner.query.bind(runner) as QueryExecutor,
        { scope: 'lab', labId },
        { local: true },
      );
      const result = await execute(runner.manager);
      await runner.commitTransaction();
      return result;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async withPlatformAdminContext<T>(
    execute: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const runner = this.dataSource.createQueryRunner();
    this.markRunnerSkipAutoContext(runner);
    await runner.connect();
    await runner.startTransaction();

    try {
      await this.applyRequestContextWithExecutor(
        runner.query.bind(runner) as QueryExecutor,
        { scope: 'admin', labId: null },
        { local: true },
      );
      const result = await execute(runner.manager);
      await runner.commitTransaction();
      return result;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async applyRequestContextWithExecutor(
    executeQuery: QueryExecutor,
    context: RequestRlsContext,
    options: { local?: boolean } = {},
  ): Promise<boolean> {
    if (context.scope === 'none') {
      return false;
    }

    const useLocal = options.local === true;
    if (context.scope === 'lab') {
      if (!context.labId) {
        if (this.strictRlsMode) {
          throw new Error('[SECURITY][RLS] Missing labId for lab-scoped DB context.');
        }
        return false;
      }
      await executeQuery(`SELECT set_config('app.current_lab_id', $1, $2)`, [context.labId, useLocal]);
      await this.trySetRole(executeQuery, 'app_lab_user', useLocal);
      return true;
    }

    await executeQuery(`SELECT set_config('app.current_lab_id', $1, $2)`, ['', useLocal]);
    await this.trySetRole(executeQuery, 'app_platform_admin', useLocal);
    return true;
  }

  async resetRequestContextWithExecutor(executeQuery: QueryExecutor): Promise<void> {
    try {
      await executeQuery(`SELECT set_config('app.current_lab_id', $1, false)`, ['']);
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
    useLocal: boolean,
  ): Promise<void> {
    const safeRole = role.trim();
    if (!/^[a-z_][a-z0-9_]*$/i.test(safeRole)) {
      this.failOrWarn(
        `Invalid role identifier for RLS context: ${role}`,
        this.warnedMissingRoles,
      );
      return;
    }

    const status = await executeQuery(
      `
      SELECT
        EXISTS(SELECT 1 FROM pg_roles WHERE rolname = $1) AS "roleExists",
        CASE
          WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname = $1)
            THEN pg_has_role(current_user, $1, 'MEMBER')
          ELSE false
        END AS "canSetRole"
      `,
      [safeRole],
    ) as Array<{ roleExists: boolean | string; canSetRole: boolean | string }>;

    const roleExists = this.toBoolean(status?.[0]?.roleExists);
    const canSetRole = this.toBoolean(status?.[0]?.canSetRole);

    if (!roleExists) {
      this.failOrWarn(
        `Skipped SET ROLE ${safeRole}: role does not exist.`,
        this.warnedMissingRoles,
      );
      return;
    }

    if (!canSetRole) {
      this.failOrWarn(
        `Skipped SET ROLE ${safeRole}: current DB user is not a member.`,
        this.warnedMembershipRoles,
      );
      return;
    }

    if (safeRole === 'app_platform_admin') {
      const hasPrivilegeRows = await executeQuery(
        `
        SELECT
          CASE
            WHEN to_regclass('public.labs') IS NULL THEN true
            ELSE has_table_privilege($1, 'public.labs', 'SELECT')
          END AS "hasLabsSelect"
        `,
        [safeRole],
      ) as Array<{ hasLabsSelect: boolean | string }>;

      const hasLabsSelect = this.toBoolean(hasPrivilegeRows?.[0]?.hasLabsSelect);
      if (!hasLabsSelect) {
        this.failOrWarn(
          `Skipped SET ROLE ${safeRole}: role lacks SELECT privilege on public.labs.`,
          this.warnedMissingRolePrivileges,
        );
        return;
      }
    }

    try {
      await executeQuery(`${useLocal ? 'SET LOCAL ROLE' : 'SET ROLE'} ${safeRole}`);
    } catch (error) {
      if (safeRole === 'app_platform_admin') {
        const message = error instanceof Error ? error.message : String(error);
        this.failOrWarn(
          `Skipped SET ROLE ${safeRole}: ${message}`,
          this.warnedMissingRolePrivileges,
          `${safeRole}:set-role:${message}`,
        );
        return;
      }
      throw error;
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

  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === 't' || normalized === '1';
    }
    if (typeof value === 'number') {
      return value === 1;
    }
    return false;
  }
}
