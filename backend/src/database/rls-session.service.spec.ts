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
    roleExists?: boolean;
    canSetRole?: boolean;
    hasLabsSelect?: boolean;
    throwOnReset?: boolean;
  } = {}): jest.Mock<Promise<unknown>, [string, unknown[]?]> {
    const roleExists = options.roleExists ?? true;
    const canSetRole = options.canSetRole ?? true;
    const hasLabsSelect = options.hasLabsSelect ?? true;
    const throwOnReset = options.throwOnReset ?? false;

    return jest.fn(async (query: string) => {
      if (query.includes('EXISTS(SELECT 1 FROM pg_roles')) {
        return [{ roleExists, canSetRole }];
      }
      if (query.includes('has_table_privilege')) {
        return [{ hasLabsSelect }];
      }
      if (throwOnReset && query.includes('RESET ROLE')) {
        throw new Error('reset failed');
      }
      return [];
    });
  }

  it('throws in strict mode when role is missing', async () => {
    const service = createService(true);
    const executeQuery = createExecutor({ roleExists: false, canSetRole: false });

    await expect(
      service.applyRequestContextWithExecutor(executeQuery, { scope: 'lab', labId: 'lab-1' }),
    ).rejects.toThrow('[SECURITY][RLS] Skipped SET ROLE app_lab_user: role does not exist.');
  });

  it('does not throw in non-strict mode when role is missing', async () => {
    const service = createService(false);
    const executeQuery = createExecutor({ roleExists: false, canSetRole: false });

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
});
