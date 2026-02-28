import { CanActivate, ExecutionContext } from '@nestjs/common';
export declare class AdminHostGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean;
}
