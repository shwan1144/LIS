export type RequestRlsScope = 'none' | 'lab' | 'admin';

export interface RequestRlsContext {
  scope: RequestRlsScope;
  labId: string | null;
}

export const NONE_RLS_CONTEXT: RequestRlsContext = Object.freeze({
  scope: 'none',
  labId: null,
});
