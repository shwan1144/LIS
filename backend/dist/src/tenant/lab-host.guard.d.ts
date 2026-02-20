import { CanActivate, ExecutionContext } from '@nestjs/common';
export declare class LabHostGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean;
}
