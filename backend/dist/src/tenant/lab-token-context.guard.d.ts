import { CanActivate, ExecutionContext } from '@nestjs/common';
export declare class LabTokenContextGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean;
}
