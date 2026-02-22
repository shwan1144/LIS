import { DataSource, QueryRunner } from 'typeorm';
import { RequestRlsContextService } from './request-rls-context.service';
import { RlsQueryRunnerEnforcerService } from './rls-query-runner-enforcer.service';
import { RlsSessionService } from './rls-session.service';

type MutableQueryRunner = QueryRunner & {
  data?: Record<string, unknown>;
};

describe('RlsQueryRunnerEnforcerService', () => {
  const createRunner = (): MutableQueryRunner => {
    const runner = {
      data: {},
      query: jest.fn(async () => []),
      release: jest.fn(async () => undefined),
    };
    return runner as unknown as MutableQueryRunner;
  };

  it('applies request context once per runner and resets on release', async () => {
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
  });
});
