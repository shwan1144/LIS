import { DataSource, QueryRunner } from 'typeorm';
import { RequestRlsContextService } from './request-rls-context.service';
import { RlsQueryRunnerEnforcerService } from './rls-query-runner-enforcer.service';
import { RlsSessionService } from './rls-session.service';

type MutableQueryRunner = QueryRunner & {
  data?: Record<string, unknown>;
};

describe('RlsQueryRunnerEnforcerService', () => {
  const createRunner = (options: { throwOnQuery?: string } = {}): MutableQueryRunner => {
    const state = { isTransactionActive: false };
    const runner = {
      data: {},
      query: jest.fn(async (query: string) => {
        const normalized = query.trim().toUpperCase();
        if (normalized === 'BEGIN' || normalized.startsWith('START TRANSACTION')) {
          state.isTransactionActive = true;
        } else if (normalized === 'COMMIT' || normalized === 'ROLLBACK') {
          state.isTransactionActive = false;
        }
        if (options.throwOnQuery && query === options.throwOnQuery) {
          throw new Error('query failed');
        }
        return [];
      }),
      release: jest.fn(async () => undefined),
      startTransaction: jest.fn(async () => {
        state.isTransactionActive = true;
      }),
      commitTransaction: jest.fn(async () => {
        state.isTransactionActive = false;
      }),
      rollbackTransaction: jest.fn(async () => {
        state.isTransactionActive = false;
      }),
    };
    Object.defineProperty(runner, 'isTransactionActive', {
      get: () => state.isTransactionActive,
      set: (value: boolean) => {
        state.isTransactionActive = value;
      },
      enumerable: true,
      configurable: true,
    });

    return runner as unknown as MutableQueryRunner;
  };

  it('applies request context once, auto-wraps transaction, and commits on release', async () => {
    const runner = createRunner();
    const dataSource = {
      createQueryRunner: jest.fn(() => runner),
    } as unknown as DataSource;
    const requestContextService = {
      getContext: jest.fn(() => ({ scope: 'lab', labId: 'lab-1' })),
    } as unknown as RequestRlsContextService;
    const rlsSessionService = {
      applyRequestContextWithExecutor: jest.fn(async () => true),
      resetRequestContextWithExecutor: jest.fn(async () => undefined),
    } as unknown as RlsSessionService;

    const service = new RlsQueryRunnerEnforcerService(
      dataSource,
      requestContextService,
      rlsSessionService,
    );
    service.onModuleInit();

    const patchedRunner = dataSource.createQueryRunner();
    await patchedRunner.query('SELECT 1');
    await patchedRunner.query('SELECT 2');
    await patchedRunner.release();

    expect(rlsSessionService.applyRequestContextWithExecutor).toHaveBeenCalledTimes(1);
    expect(rlsSessionService.resetRequestContextWithExecutor).toHaveBeenCalledTimes(1);
    expect(runner.startTransaction).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('rolls back auto transaction when query fails', async () => {
    const runner = createRunner({ throwOnQuery: 'SELECT fail' });
    const dataSource = {
      createQueryRunner: jest.fn(() => runner),
    } as unknown as DataSource;
    const requestContextService = {
      getContext: jest.fn(() => ({ scope: 'lab', labId: 'lab-1' })),
    } as unknown as RequestRlsContextService;
    const rlsSessionService = {
      applyRequestContextWithExecutor: jest.fn(async () => true),
      resetRequestContextWithExecutor: jest.fn(async () => undefined),
    } as unknown as RlsSessionService;

    const service = new RlsQueryRunnerEnforcerService(
      dataSource,
      requestContextService,
      rlsSessionService,
    );
    service.onModuleInit();

    const patchedRunner = dataSource.createQueryRunner();
    await expect(patchedRunner.query('SELECT fail')).rejects.toThrow('query failed');
    await patchedRunner.release();

    expect(rlsSessionService.applyRequestContextWithExecutor).toHaveBeenCalledTimes(1);
    expect(rlsSessionService.resetRequestContextWithExecutor).toHaveBeenCalledTimes(1);
    expect(runner.startTransaction).toHaveBeenCalledTimes(1);
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).not.toHaveBeenCalled();
  });

  it('skips auto context when runner marks skip flag', async () => {
    const runner = createRunner();
    runner.data = { skipAutomaticRlsContext: true };
    const dataSource = {
      createQueryRunner: jest.fn(() => runner),
    } as unknown as DataSource;
    const requestContextService = {
      getContext: jest.fn(() => ({ scope: 'lab', labId: 'lab-1' })),
    } as unknown as RequestRlsContextService;
    const rlsSessionService = {
      applyRequestContextWithExecutor: jest.fn(async () => true),
      resetRequestContextWithExecutor: jest.fn(async () => undefined),
    } as unknown as RlsSessionService;

    const service = new RlsQueryRunnerEnforcerService(
      dataSource,
      requestContextService,
      rlsSessionService,
    );
    service.onModuleInit();

    const patchedRunner = dataSource.createQueryRunner();
    await patchedRunner.query('SELECT 1');
    await patchedRunner.release();

    expect(rlsSessionService.applyRequestContextWithExecutor).not.toHaveBeenCalled();
    expect(rlsSessionService.resetRequestContextWithExecutor).not.toHaveBeenCalled();
    expect(runner.startTransaction).not.toHaveBeenCalled();
  });

  it('skips auto context when request scope is none', async () => {
    const runner = createRunner();
    const dataSource = {
      createQueryRunner: jest.fn(() => runner),
    } as unknown as DataSource;
    const requestContextService = {
      getContext: jest.fn(() => ({ scope: 'none', labId: null })),
    } as unknown as RequestRlsContextService;
    const rlsSessionService = {
      applyRequestContextWithExecutor: jest.fn(async () => true),
      resetRequestContextWithExecutor: jest.fn(async () => undefined),
    } as unknown as RlsSessionService;

    const service = new RlsQueryRunnerEnforcerService(
      dataSource,
      requestContextService,
      rlsSessionService,
    );
    service.onModuleInit();

    const patchedRunner = dataSource.createQueryRunner();
    await patchedRunner.query('SELECT 1');
    await patchedRunner.release();

    expect(rlsSessionService.applyRequestContextWithExecutor).not.toHaveBeenCalled();
    expect(rlsSessionService.resetRequestContextWithExecutor).not.toHaveBeenCalled();
    expect(runner.startTransaction).not.toHaveBeenCalled();
  });

  it('does not run setup on BEGIN and reuses existing transaction for first non-control query', async () => {
    const runner = createRunner();
    const dataSource = {
      createQueryRunner: jest.fn(() => runner),
    } as unknown as DataSource;
    const requestContextService = {
      getContext: jest.fn(() => ({ scope: 'lab', labId: 'lab-1' })),
    } as unknown as RequestRlsContextService;
    const rlsSessionService = {
      applyRequestContextWithExecutor: jest.fn(async () => true),
      resetRequestContextWithExecutor: jest.fn(async () => undefined),
    } as unknown as RlsSessionService;

    const service = new RlsQueryRunnerEnforcerService(
      dataSource,
      requestContextService,
      rlsSessionService,
    );
    service.onModuleInit();

    const patchedRunner = dataSource.createQueryRunner();
    await patchedRunner.query('BEGIN');
    expect(rlsSessionService.applyRequestContextWithExecutor).not.toHaveBeenCalled();
    await patchedRunner.query('SELECT 1');
    await patchedRunner.release();

    expect(rlsSessionService.applyRequestContextWithExecutor).toHaveBeenCalledTimes(1);
    expect(runner.startTransaction).not.toHaveBeenCalled();
  });
});
