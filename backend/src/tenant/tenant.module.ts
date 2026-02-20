import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { Lab } from '../entities/lab.entity';
import { LabResolverMiddleware } from './lab-resolver.middleware';
import { LabHostGuard } from './lab-host.guard';
import { AdminHostGuard } from './admin-host.guard';
import { LabTokenContextGuard } from './lab-token-context.guard';
import { LabUserScopeGuard } from './lab-user-scope.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Lab])],
  providers: [
    LabResolverMiddleware,
    LabHostGuard,
    AdminHostGuard,
    LabTokenContextGuard,
    LabUserScopeGuard,
    {
      provide: APP_GUARD,
      useClass: LabUserScopeGuard,
    },
  ],
  exports: [LabHostGuard, AdminHostGuard, LabTokenContextGuard],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LabResolverMiddleware).forRoutes('*');
  }
}
