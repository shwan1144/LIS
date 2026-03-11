import { NotFoundException } from '@nestjs/common';
import { SettingsService } from '../src/settings/settings.service';
import { User } from '../src/entities/user.entity';
import { UserShiftAssignment } from '../src/entities/user-shift-assignment.entity';
import { UserDepartmentAssignment } from '../src/entities/user-department-assignment.entity';
import { Department } from '../src/entities/department.entity';
import { Shift } from '../src/entities/shift.entity';

describe('SettingsService user scope safety (e2e-style)', () => {
  it('returns shiftIds only for the requested lab in getUserWithDetails', async () => {
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        username: 'alice',
        labAssignments: [{ labId: 'lab-1' }, { labId: 'lab-2' }],
        shiftAssignments: [
          { shiftId: 'shift-lab-1', shift: { labId: 'lab-1' } },
          { shiftId: 'shift-lab-2', shift: { labId: 'lab-2' } },
        ],
        departmentAssignments: [
          { departmentId: 'dept-lab-1', department: { labId: 'lab-1' } },
          { departmentId: 'dept-lab-2', department: { labId: 'lab-2' } },
        ],
        defaultLab: null,
      }),
    };

    const service = new SettingsService(
      userRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const detail = await service.getUserWithDetails('user-1', 'lab-1');

    expect(detail.shiftIds).toEqual(['shift-lab-1']);
    expect(detail.departmentIds).toEqual(['dept-lab-1']);
    expect(detail.labIds).toEqual(['lab-1', 'lab-2']);
  });

  it('throws when user is not assigned to the requested lab', async () => {
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        labAssignments: [{ labId: 'lab-2' }],
      }),
    };

    const service = new SettingsService(
      userRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.getUserWithDetails('user-1', 'lab-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('removes shift assignments only inside the current lab during updateUser', async () => {
    const user = {
      id: 'user-1',
      labAssignments: [{ labId: 'lab-1' }],
      shiftAssignments: [],
      departmentAssignments: [],
      defaultLab: null,
    } as unknown as User;

    const shiftDeleteQb = {
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };

    const userRepoTx = {
      findOne: jest.fn().mockResolvedValueOnce(user).mockResolvedValueOnce(user),
      save: jest.fn().mockResolvedValue(user),
    };
    const shiftAssignmentRepoTx = {
      createQueryBuilder: jest.fn().mockReturnValue(shiftDeleteQb),
      insert: jest.fn(),
    };
    const userDeptRepoTx = {
      createQueryBuilder: jest.fn(),
      insert: jest.fn(),
    };
    const shiftRepoTx = {
      find: jest.fn().mockResolvedValue([{ id: 'shift-a' }, { id: 'shift-b' }]),
    };
    const departmentRepoTx = {
      find: jest.fn(),
    };

    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === User) return userRepoTx;
        if (entity === UserShiftAssignment) return shiftAssignmentRepoTx;
        if (entity === UserDepartmentAssignment) return userDeptRepoTx;
        if (entity === Shift) return shiftRepoTx;
        if (entity === Department) return departmentRepoTx;
        return {};
      }),
    };

    const rootUserRepo = {
      manager: {
        transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) =>
          callback(manager),
        ),
      },
    };

    const service = new SettingsService(
      rootUserRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.updateUser('user-1', 'lab-1', { shiftIds: [] });

    expect(shiftAssignmentRepoTx.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(shiftDeleteQb.delete).toHaveBeenCalledTimes(1);
    expect(shiftDeleteQb.where).toHaveBeenCalledWith('userId = :userId', { userId: 'user-1' });
    expect(shiftDeleteQb.andWhere).toHaveBeenCalledWith('shiftId IN (:...shiftIds)', {
      shiftIds: ['shift-a', 'shift-b'],
    });
    expect(shiftAssignmentRepoTx.insert).not.toHaveBeenCalled();
  });
});
