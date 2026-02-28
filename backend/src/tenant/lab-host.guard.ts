import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { HostScope } from './host-scope.enum';

@Injectable()
export class LabHostGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (req.hostScope !== HostScope.LAB || !req.labId) {
      throw new ForbiddenException('Lab scope required for this endpoint');
    }
    return true;
  }
}

