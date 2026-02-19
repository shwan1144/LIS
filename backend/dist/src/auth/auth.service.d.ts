import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { AuditService } from '../audit/audit.service';
export declare class AuthService {
    private readonly userRepository;
    private readonly jwtService;
    private readonly auditService;
    constructor(userRepository: Repository<User>, jwtService: JwtService, auditService: AuditService);
    login(dto: LoginDto): Promise<LoginResponseDto>;
    private resolveLabForUser;
    private toUserDto;
    private toLabDto;
}
