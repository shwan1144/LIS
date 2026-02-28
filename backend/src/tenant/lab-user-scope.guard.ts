import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { HostScope } from './host-scope.enum';

@Injectable()
export class LabUserScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const path: string = req.path || req.originalUrl || '';

    // Admin endpoints have their own host/auth guards.
    if (path.startsWith('/admin')) return true;

    // Allow unauthenticated routes (login/public endpoints).
    if (!req.user) return true;

    // For lab-authenticated tokens, enforce host scope + resolved lab context.
    const tokenLabId = req.user?.labId as string | undefined;
    if (!tokenLabId) return true;

    if (req.hostScope !== HostScope.LAB || !req.labId) {
      throw new ForbiddenException('Lab host scope required');
    }
    if (req.labId !== tokenLabId) {
      throw new ForbiddenException('Token lab context mismatch');
    }

    return true;
  }
}

