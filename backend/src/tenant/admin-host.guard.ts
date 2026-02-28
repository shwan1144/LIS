import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { HostScope } from './host-scope.enum';

@Injectable()
export class AdminHostGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (req.hostScope !== HostScope.ADMIN) {
      throw new ForbiddenException('Admin host required for this endpoint');
    }
    return true;
  }
}

