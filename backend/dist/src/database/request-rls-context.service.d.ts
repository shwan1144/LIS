import { RequestRlsContext } from './request-rls-context.types';
export declare class RequestRlsContextService {
    private readonly storage;
    runWithContext<T>(context: RequestRlsContext, execute: () => T): T;
    getContext(): RequestRlsContext;
}
