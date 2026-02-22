import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { NONE_RLS_CONTEXT, RequestRlsContext } from './request-rls-context.types';

@Injectable()
export class RequestRlsContextService {
  private readonly storage = new AsyncLocalStorage<RequestRlsContext>();

  runWithContext<T>(context: RequestRlsContext, execute: () => T): T {
    return this.storage.run(context, execute);
  }

  getContext(): RequestRlsContext {
    return this.storage.getStore() ?? NONE_RLS_CONTEXT;
  }
}
