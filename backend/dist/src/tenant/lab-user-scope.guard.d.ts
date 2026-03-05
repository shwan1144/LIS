import { CanActivate, ExecutionContext } from '@nestjs/common';
export declare class LabUserScopeGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean;
}
