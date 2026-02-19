import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { Lab } from '../entities/lab.entity';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto, LabDto, UserDto } from './dto/login-response.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../entities/audit-log.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.userRepository.findOne({
      where: { username: dto.username, isActive: true },
      relations: ['defaultLab', 'labAssignments', 'labAssignments.lab'],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const lab = this.resolveLabForUser(user);
    if (!lab) {
      throw new UnauthorizedException('User has no lab assigned');
    }

    const payload = { sub: user.id, username: user.username, labId: lab.id, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    // Audit log for successful login
    await this.auditService.log({
      labId: lab.id,
      userId: user.id,
      action: AuditAction.LOGIN,
      entityType: 'user',
      entityId: user.id,
      description: `User ${user.username} logged in`,
    });

    return {
      accessToken,
      user: this.toUserDto(user),
      lab: this.toLabDto(lab),
    };
  }

  private resolveLabForUser(user: User): Lab | null {
    if (user.defaultLabId && user.defaultLab) {
      return user.defaultLab;
    }
    const firstAssignment = user.labAssignments?.[0];
    return firstAssignment?.lab ?? null;
  }

  private toUserDto(user: User): UserDto {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    };
  }

  private toLabDto(lab: Lab): LabDto {
    return {
      id: lab.id,
      code: lab.code,
      name: lab.name,
      labelSequenceBy: lab.labelSequenceBy ?? 'tube_type',
      sequenceResetBy: lab.sequenceResetBy ?? 'day',
      enableOnlineResults: lab.enableOnlineResults !== false,
    };
  }
}
