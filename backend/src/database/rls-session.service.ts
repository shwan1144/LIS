import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';

@Injectable()
export class RlsSessionService {
  private readonly logger = new Logger(RlsSessionService.name);
  private readonly warnedMissingRoles = new Set<string>();
  private readonly warnedMembershipRoles = new Set<string>();
  private readonly warnedMissingRolePrivileges = new Set<string>();

  constructor(private readonly dataSource: DataSource) {}

  async withLabContext<T>(
    labId: string,
    execute: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      await runner.query(`SELECT set_config('app.current_lab_id', $1, true)`, [labId]);
      await this.trySetLocalRole(runner, 'app_lab_user');
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
    await runner.connect();
    await runner.startTransaction();

    try {
      await runner.query(`SELECT set_config('app.current_lab_id', '', true)`);
      await this.trySetLocalRole(runner, 'app_platform_admin');
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

  private async trySetLocalRole(runner: QueryRunner, role: string): Promise<void> {
    const safeRole = role.trim();
    if (!/^[a-z_][a-z0-9_]*$/i.test(safeRole)) {
      this.logger.warn(`Skipped invalid role identifier: ${role}`);
      return;
    }

    const status = await runner.query(
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
    ) as Array<{ roleExists: boolean; canSetRole: boolean }>;

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
      const hasPrivilegeRows = await runner.query(
        `
        SELECT
          CASE
            WHEN to_regclass('public.labs') IS NULL THEN true
            ELSE has_table_privilege($1, 'public.labs', 'SELECT')
          END AS "hasLabsSelect"
        `,
        [safeRole],
      ) as Array<{ hasLabsSelect: boolean }>;

      const hasLabsSelect = Boolean(hasPrivilegeRows?.[0]?.hasLabsSelect);
      if (!hasLabsSelect) {
        if (!this.warnedMissingRolePrivileges.has(safeRole)) {
          this.logger.warn(
            `Skipped SET LOCAL ROLE ${safeRole}: role lacks SELECT privilege on public.labs.`,
          );
          this.warnedMissingRolePrivileges.add(safeRole);
        }
        return;
      }
    }

    try {
      await runner.query(`SET LOCAL ROLE ${safeRole}`);
    } catch (error) {
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

}
