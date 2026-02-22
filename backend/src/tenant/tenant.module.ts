import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { Lab } from '../entities/lab.entity';
import { DatabaseSupportModule } from '../database/database-support.module';
import { LabResolverMiddleware } from './lab-resolver.middleware';
import { LabHostGuard } from './lab-host.guard';
import { AdminHostGuard } from './admin-host.guard';
import { LabTokenContextGuard } from './lab-token-context.guard';
import { LabUserScopeGuard } from './lab-user-scope.guard';
import { TenantRlsContextMiddleware } from './tenant-rls-context.middleware';

@Module({
  imports: [TypeOrmModule.forFeature([Lab]), DatabaseSupportModule],
  providers: [
    LabResolverMiddleware,
    TenantRlsContextMiddleware,
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
    consumer.apply(LabResolverMiddleware, TenantRlsContextMiddleware).forRoutes('*');
  }
}
