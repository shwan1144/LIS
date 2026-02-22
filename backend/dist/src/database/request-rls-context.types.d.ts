export type RequestRlsScope = 'none' | 'lab' | 'admin';
export interface RequestRlsContext {
    scope: RequestRlsScope;
    labId: string | null;
}
export declare const NONE_RLS_CONTEXT: RequestRlsContext;
