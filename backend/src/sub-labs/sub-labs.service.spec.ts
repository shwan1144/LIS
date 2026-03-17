import type { EntityManager, Repository } from 'typeorm';
import { SubLabsService } from './sub-labs.service';
import { SubLab } from '../entities/sub-lab.entity';
import { SubLabTestPrice } from '../entities/sub-lab-test-price.entity';
import { User } from '../entities/user.entity';
import { Test } from '../entities/test.entity';
import { Order } from '../entities/order.entity';

describe('SubLabsService', () => {
  it('creates a sub-lab and returns its detail from the same transaction manager', async () => {
    const createdAt = new Date('2026-03-17T00:00:00.000Z');
    const updatedAt = new Date('2026-03-17T00:00:00.000Z');
    const createdSubLab = {
      id: 'sub-1',
      labId: 'lab-1',
      name: 'salar',
      isActive: true,
      createdAt,
      updatedAt,
    } as SubLab;

    const rootSubLabFindOne = jest.fn().mockResolvedValue(null);
    const userFindOne = jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if ('username' in where) {
        return Promise.resolve(null);
      }
      if (where.subLabId === 'sub-1') {
        return Promise.resolve({
          id: 'user-1',
          username: 'salar',
          subLabId: 'sub-1',
          labId: 'lab-1',
        } as User);
      }
      return Promise.resolve(null);
    });
    const userSave = jest.fn().mockImplementation(async (user: User) => ({
      ...user,
      id: 'user-1',
    }));
    const subLabCreate = jest.fn().mockImplementation((payload: Partial<SubLab>) => payload);
    const subLabSave = jest.fn().mockResolvedValue(createdSubLab);
    const subLabFindOne = jest.fn().mockResolvedValue(createdSubLab);
    const priceDelete = jest.fn().mockResolvedValue({ affected: 0 });
    const priceInsert = jest.fn().mockResolvedValue(undefined);
    const priceFind = jest.fn().mockResolvedValue([]);
    const testFind = jest.fn().mockResolvedValue([]);

    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === SubLab) {
          return {
            create: subLabCreate,
            save: subLabSave,
            findOne: subLabFindOne,
          };
        }
        if (entity === User) {
          return {
            findOne: userFindOne,
            save: userSave,
          };
        }
        if (entity === SubLabTestPrice) {
          return {
            delete: priceDelete,
            insert: priceInsert,
            find: priceFind,
          };
        }
        if (entity === Test) {
          return {
            find: testFind,
          };
        }
        throw new Error(`Unexpected repository request: ${String(entity)}`);
      },
    } as unknown as EntityManager;

    const subLabRepo = {
      findOne: rootSubLabFindOne,
      manager: {
        transaction: async (callback: (txnManager: EntityManager) => Promise<unknown>) =>
          callback(manager),
      },
    } as unknown as Partial<Repository<SubLab>>;

    const service = new SubLabsService(
      subLabRepo as Repository<SubLab>,
      {} as Repository<SubLabTestPrice>,
      {} as Repository<User>,
      {} as Repository<Test>,
      {} as Repository<Order>,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.createForLab('lab-1', {
      name: 'salar',
      username: 'salar',
      password: 'secret-123',
      prices: [],
    });

    expect(result).toEqual({
      id: 'sub-1',
      name: 'salar',
      isActive: true,
      createdAt,
      updatedAt,
      username: 'salar',
      prices: [],
    });
    expect(rootSubLabFindOne).not.toHaveBeenCalled();
    expect(subLabFindOne).toHaveBeenCalledWith({
      where: { id: 'sub-1', labId: 'lab-1' },
    });
    expect(priceDelete).toHaveBeenCalledWith({ subLabId: 'sub-1' });
  });
});
