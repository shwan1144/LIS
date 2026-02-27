import { DataSource } from 'typeorm';
import { RlsSessionService } from './rls-session.service';

describe('RlsSessionService strict mode', () => {
  const originalStrictFlag = process.env.RLS_STRICT_MODE;

  afterEach(() => {
    if (originalStrictFlag === undefined) {
      delete process.env.RLS_STRICT_MODE;
    } else {
      process.env.RLS_STRICT_MODE = originalStrictFlag;
    }
  });

  function createService(strict: boolean): RlsSessionService {
    process.env.RLS_STRICT_MODE = strict ? 'true' : 'false';
    return new RlsSessionService({} as DataSource);
  }

  function createExecutor(options: {
    throwOnSetRole?: boolean;
    throwOnReset?: boolean;
  } = {}): jest.Mock<Promise<unknown>, [string, unknown[]?]> {
    const throwOnSetRole = options.throwOnSetRole ?? false;
    const throwOnReset = options.throwOnReset ?? false;

    return jest.fn(async (query: string) => {
      if (throwOnSetRole && query.includes('SET ROLE')) {
        throw new Error('set role failed');
      }
      if (throwOnReset && query.includes('RESET ROLE')) {
        throw new Error('reset failed');
      }
      return [];
    });
  }

  it('throws in strict mode when SET ROLE fails', async () => {
    const service = createService(true);
    const executeQuery = createExecutor({ throwOnSetRole: true });

    await expect(
      service.applyRequestContextWithExecutor(executeQuery, { scope: 'lab', labId: 'lab-1' }),
    ).rejects.toThrow('[SECURITY][RLS] Skipped SET ROLE app_lab_user: set role failed');
  });

  it('does not throw in non-strict mode when SET ROLE fails', async () => {
    const service = createService(false);
    const executeQuery = createExecutor({ throwOnSetRole: true });

    await expect(
      service.applyRequestContextWithExecutor(executeQuery, { scope: 'lab', labId: 'lab-1' }),
    ).resolves.toBe(true);
  });

  it('throws in strict mode when lab context lacks labId', async () => {
    const service = createService(true);
    const executeQuery = createExecutor();

    await expect(
      service.applyRequestContextWithExecutor(executeQuery, { scope: 'lab', labId: null }),
    ).rejects.toThrow('[SECURITY][RLS] Missing labId for lab-scoped DB context.');
  });

  it('throws in strict mode when reset context fails', async () => {
    const service = createService(true);
    const executeQuery = createExecutor({ throwOnReset: true });

    await expect(service.resetRequestContextWithExecutor(executeQuery)).rejects.toThrow(
      '[SECURITY][RLS] Failed to reset DB request context: reset failed',
    );
  });

  it('uses transaction-local lab context and avoids metadata checks', async () => {
    const service = createService(true);
    const executeQuery = createExecutor();

    await service.applyRequestContextWithExecutor(executeQuery, { scope: 'lab', labId: 'lab-1' });

    const calls = executeQuery.mock.calls.map(([query]) => query.trim());
    expect(calls).toContain(`SELECT set_config('app.current_lab_id', $1, true)`);
    expect(calls).toContain('SET ROLE app_lab_user');
    expect(calls.some((query) => query.includes('pg_roles'))).toBe(false);
    expect(calls.some((query) => query.includes('pg_has_role'))).toBe(false);
    expect(calls.some((query) => query.includes('has_table_privilege'))).toBe(false);
  });

  it('reset helper only resets role', async () => {
    const service = createService(true);
    const executeQuery = createExecutor();

    await service.resetRequestContextWithExecutor(executeQuery);

    const calls = executeQuery.mock.calls.map(([query]) => query.trim());
    expect(calls).toEqual(['RESET ROLE']);
  });
});
