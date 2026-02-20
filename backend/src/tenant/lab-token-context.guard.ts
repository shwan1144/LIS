import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class LabTokenContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const tokenLabId = req.user?.labId as string | undefined;
    const resolvedLabId = req.labId as string | null | undefined;
    if (!tokenLabId || !resolvedLabId || tokenLabId !== resolvedLabId) {
      throw new ForbiddenException('Token lab context mismatch');
    }
    return true;
  }
}

