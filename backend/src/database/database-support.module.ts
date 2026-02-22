import { Global, Module } from '@nestjs/common';
import { RequestRlsContextService } from './request-rls-context.service';
import { RlsQueryRunnerEnforcerService } from './rls-query-runner-enforcer.service';
import { RlsSessionService } from './rls-session.service';

@Global()
@Module({
  providers: [RlsSessionService, RequestRlsContextService, RlsQueryRunnerEnforcerService],
  exports: [RlsSessionService, RequestRlsContextService, RlsQueryRunnerEnforcerService],
})
export class DatabaseSupportModule {}
