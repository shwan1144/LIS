import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { AuthModule } from '../auth/auth.module';
import { User } from '../entities/user.entity';
import { UserLabAssignment } from '../entities/user-lab-assignment.entity';
import { UserShiftAssignment } from '../entities/user-shift-assignment.entity';
import { UserDepartmentAssignment } from '../entities/user-department-assignment.entity';
import { Department } from '../entities/department.entity';
import { Lab } from '../entities/lab.entity';
import { Shift } from '../entities/shift.entity';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      User,
      UserLabAssignment,
      UserShiftAssignment,
      UserDepartmentAssignment,
      Department,
      Lab,
      Shift,
    ]),
  ],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
