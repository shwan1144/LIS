import type { LabDto, UserDto } from '../api/client';
import { getCurrentAuthScope, resolveApiBaseUrl, type AuthScope } from '../utils/tenant-scope';

const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const AUTH_SESSION_STORAGE_KEY = 'lis_auth_session';
const AUTH_SYNC_STORAGE_KEY = 'lis_auth_sync';
const REFRESH_LOCK_KEY_PREFIX = 'lis_auth_refresh_lock_';
const REFRESH_BUFFER_MS = 60_000;
const REFRESH_LOCK_TIMEOUT_MS = 15_000;
const EXTERNAL_REFRESH_WAIT_MS = 17_000;
const REFRESH_POLL_INTERVAL_MS = 250;

export interface AuthSession {
  accessToken: string;
  refreshToken: string | null;
  user: UserDto;
  lab: LabDto | null;
  scope: AuthScope;
}

export interface AuthSessionState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserDto | null;
  lab: LabDto | null;
  scope: AuthScope | null;
  isReady: boolean;
}

interface SyncMessage {
  type: 'session' | 'clear';
  session?: AuthSession;
  expired?: boolean;
  scope?: AuthScope | null;
  sourceTabId: string;
  timestamp: number;
}

interface RefreshResponseShape {
  accessToken: string;
  refreshToken: string;
  user?: UserDto;
  lab?: LabDto | null;
  platformUser?: {
    id: string;
    email: string;
    role: string;
  };
}

type AuthStateListener = (state: AuthSessionState) => void;

const tabId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

let currentState: AuthSessionState = {
  accessToken: null,
  refreshToken: null,
  user: null,
  lab: null,
  scope: getCurrentAuthScope(),
  isReady: false,
};

const listeners = new Set<AuthStateListener>();
let initialized = false;
let initializePromise: Promise<AuthSessionState> | null = null;
let refreshPromise: Promise<AuthSession | null> | null = null;
let refreshTimer: number | null = null;
let broadcastChannel: BroadcastChannel | null = null;

function notifyState() {
  for (const listener of listeners) {
    listener({ ...currentState });
  }
}

function readLegacySession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const accessToken = sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken');
  const userStr = sessionStorage.getItem('user') || localStorage.getItem('user');
  const labStr = sessionStorage.getItem('lab') || localStorage.getItem('lab');
  const scope = ((sessionStorage.getItem('authScope') || localStorage.getItem('authScope')) as AuthScope | null) ?? getCurrentAuthScope();

  if (!accessToken || !userStr) return null;

  try {
    return {
      accessToken,
      refreshToken: sessionStorage.getItem('refreshToken') || localStorage.getItem('refreshToken'),
      user: JSON.parse(userStr) as UserDto,
      lab: labStr ? (JSON.parse(labStr) as LabDto) : null,
      scope,
    };
  } catch {
    return null;
  }
}

function readStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!raw) return readLegacySession();

  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.accessToken || !parsed?.user || !parsed?.scope) {
      return readLegacySession();
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : null,
      user: parsed.user,
      lab: parsed.lab ?? null,
      scope: parsed.scope,
    };
  } catch {
    return readLegacySession();
  }
}

function writeStoredSession(session: AuthSession) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  sessionStorage.setItem('accessToken', session.accessToken);
  if (session.refreshToken) {
    sessionStorage.setItem('refreshToken', session.refreshToken);
  } else {
    sessionStorage.removeItem('refreshToken');
  }
  sessionStorage.setItem('user', JSON.stringify(session.user));
  sessionStorage.setItem('authScope', session.scope);
  if (session.scope === 'LAB' && session.lab) {
    sessionStorage.setItem('lab', JSON.stringify(session.lab));
  } else {
    sessionStorage.removeItem('lab');
  }
  
  // Clear legacy localStorage data if it exists to ensure session-only behavior
  localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  localStorage.removeItem('lab');
  localStorage.removeItem('authScope');
}

function clearStoredSession() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  sessionStorage.removeItem('accessToken');
  sessionStorage.removeItem('refreshToken');
  sessionStorage.removeItem('user');
  sessionStorage.removeItem('lab');
  sessionStorage.removeItem('authScope');
  
  // Also clear legacy localStorage
  localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  localStorage.removeItem('lab');
  localStorage.removeItem('authScope');
}

function decodeJwtExpSeconds(token: string): number | null {
  try {
    const tokenParts = token.split('.');
    if (tokenParts.length < 2) return null;
    const base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = atob(padded);
    const payload = JSON.parse(decoded) as { exp?: unknown };
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null;
    return payload.exp;
  } catch {
    return null;
  }
}

function getTokenExpiryMs(token: string | null): number | null {
  if (!token) return null;
  const expSeconds = decodeJwtExpSeconds(token);
  return expSeconds ? expSeconds * 1000 : null;
}

function isAccessTokenStale(token: string | null): boolean {
  const expiryMs = getTokenExpiryMs(token);
  if (!expiryMs) return false;
  return expiryMs - Date.now() <= REFRESH_BUFFER_MS;
}

function isAccessTokenExpired(token: string | null): boolean {
  const expiryMs = getTokenExpiryMs(token);
  if (!expiryMs) return false;
  return expiryMs <= Date.now();
}

function buildUserFromRefreshResponse(scope: AuthScope, data: RefreshResponseShape): UserDto {
  if (scope === 'PLATFORM') {
    return {
      id: data.platformUser?.id || '',
      username: data.platformUser?.email || '',
      fullName: null,
      role: data.platformUser?.role || '',
    };
  }
  return data.user as UserDto;
}

function getRefreshEndpoint(scope: AuthScope): string {
  return scope === 'PLATFORM' ? '/admin/auth/refresh' : '/auth/refresh';
}

function getLogoutEndpoint(scope: AuthScope): string {
  return scope === 'PLATFORM' ? '/admin/auth/logout' : '/auth/logout';
}

function buildAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (typeof window !== 'undefined') {
    headers['x-forwarded-host'] = window.location.host;
    headers['x-forwarded-proto'] = window.location.protocol.replace(':', '');
  }
  return headers;
}

async function postAuthJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  const data = rawText ? (JSON.parse(rawText) as T | { message?: string | string[] }) : null;
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? Array.isArray(data.message)
          ? data.message[0]
          : data.message
        : null;
    throw new Error(message || `Auth request failed with status ${response.status}`);
  }

  return data as T;
}

function clearRefreshTimer() {
  if (typeof window === 'undefined') return;
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function scheduleSessionWork() {
  if (typeof window === 'undefined') return;
  clearRefreshTimer();

  if (!currentState.accessToken) return;

  const expiryMs = getTokenExpiryMs(currentState.accessToken);
  if (!expiryMs) return;

  const delayMs = currentState.refreshToken
    ? expiryMs - Date.now() - REFRESH_BUFFER_MS
    : expiryMs - Date.now();

  const run = () => {
    if (currentState.refreshToken) {
      void ensureFreshSession();
      return;
    }
    expireSession();
  };

  if (delayMs <= 0) {
    window.setTimeout(run, 0);
    return;
  }

  refreshTimer = window.setTimeout(run, delayMs);
}

function updateStateFromSession(session: AuthSession | null, isReady = currentState.isReady) {
  currentState = {
    accessToken: session?.accessToken ?? null,
    refreshToken: session?.refreshToken ?? null,
    user: session?.user ?? null,
    lab: session?.lab ?? null,
    scope: session?.scope ?? getCurrentAuthScope(),
    isReady,
  };
  scheduleSessionWork();
  notifyState();
}

function broadcast(message: Omit<SyncMessage, 'sourceTabId' | 'timestamp'>) {
  if (typeof window === 'undefined') return;
  const payload: SyncMessage = {
    ...message,
    sourceTabId: tabId,
    timestamp: Date.now(),
  };
  if (broadcastChannel) {
    broadcastChannel.postMessage(payload);
  }
  // Use sessionStorage for sync pulse if possible, but storage event needs localStorage.
  // We'll use localStorage for the pulse but it won't matter for persistence since 
  // readStoredSession checks sessionStorage.
  localStorage.setItem(AUTH_SYNC_STORAGE_KEY, JSON.stringify(payload));
}

function redirectToLoginIfNeeded() {
  if (typeof window === 'undefined') return;
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

function clearSessionInternal(options?: {
  expired?: boolean;
  broadcastChange?: boolean;
  redirect?: boolean;
}) {
  clearStoredSession();
  if (options?.expired && typeof window !== 'undefined') {
    sessionStorage.setItem('sessionExpired', '1');
  }
  updateStateFromSession(null, true);
  if (options?.broadcastChange) {
    broadcast({ type: 'clear', expired: Boolean(options.expired), scope: currentState.scope });
  }
  if (options?.redirect) {
    redirectToLoginIfNeeded();
  }
}

function applySession(
  session: AuthSession,
  options?: { broadcastChange?: boolean; fromExternal?: boolean; isReady?: boolean },
) {
  writeStoredSession(session);
  updateStateFromSession(session, options?.isReady ?? true);
  if (options?.broadcastChange && !options?.fromExternal) {
    broadcast({ type: 'session', session, scope: session.scope });
  }
}

function handleExternalMessage(message: SyncMessage) {
  if (message.sourceTabId === tabId) return;
  if (message.type === 'session' && message.session) {
    applySession(message.session, { fromExternal: true, isReady: true });
    return;
  }
  clearSessionInternal({
    expired: Boolean(message.expired),
    broadcastChange: false,
    redirect: Boolean(message.expired),
  });
}

function ensureSyncListeners() {
  if (typeof window === 'undefined' || initialized) return;

  if (typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel('lis-auth');
    broadcastChannel.onmessage = (event: MessageEvent<SyncMessage>) => {
      if (event.data) handleExternalMessage(event.data);
    };
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== AUTH_SYNC_STORAGE_KEY || !event.newValue) return;
    try {
      handleExternalMessage(JSON.parse(event.newValue) as SyncMessage);
    } catch {
      /* ignore malformed sync payloads */
    }
  });

  initialized = true;
}

function getRefreshLockKey(scope: AuthScope): string {
  return `${REFRESH_LOCK_KEY_PREFIX}${scope}`;
}

function tryAcquireRefreshLock(scope: AuthScope): boolean {
  if (typeof window === 'undefined') return true;
  const key = getRefreshLockKey(scope);
  const now = Date.now();

  try {
    const existingRaw = localStorage.getItem(key);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as { owner: string; expiresAt: number };
      if (existing.owner !== tabId && existing.expiresAt > now) {
        return false;
      }
    }
  } catch {
    /* ignore malformed locks */
  }

  const nextValue = JSON.stringify({
    owner: tabId,
    expiresAt: now + REFRESH_LOCK_TIMEOUT_MS,
  });
  localStorage.setItem(key, nextValue);

  try {
    const confirmed = JSON.parse(localStorage.getItem(key) || '{}') as { owner?: string };
    return confirmed.owner === tabId;
  } catch {
    return false;
  }
}

function releaseRefreshLock(scope: AuthScope) {
  if (typeof window === 'undefined') return;
  const key = getRefreshLockKey(scope);
  try {
    const existing = JSON.parse(localStorage.getItem(key) || '{}') as { owner?: string };
    if (existing.owner === tabId) {
      localStorage.removeItem(key);
    }
  } catch {
    localStorage.removeItem(key);
  }
}

function hasActiveRefreshLock(scope: AuthScope): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const existing = JSON.parse(localStorage.getItem(getRefreshLockKey(scope)) || '{}') as {
      expiresAt?: number;
    };
    return typeof existing.expiresAt === 'number' && existing.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForExternalRefresh(scope: AuthScope, previousRefreshToken: string): Promise<AuthSession | null> {
  const deadline = Date.now() + EXTERNAL_REFRESH_WAIT_MS;

  while (Date.now() < deadline) {
    const latest = readStoredSession();
    if (!latest || latest.scope !== scope) {
      return null;
    }
    if (latest.refreshToken && latest.refreshToken !== previousRefreshToken) {
      applySession(latest, { fromExternal: true, isReady: true });
      return latest;
    }
    if (!hasActiveRefreshLock(scope)) {
      break;
    }
    await delay(REFRESH_POLL_INTERVAL_MS);
  }

  return null;
}

function normalizeSessionForScope(scope: AuthScope, data: RefreshResponseShape): AuthSession {
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: buildUserFromRefreshResponse(scope, data),
    lab: scope === 'PLATFORM' ? null : (data.lab ?? null),
    scope,
  };
}

async function performRefresh(): Promise<AuthSession | null> {
  const session = readStoredSession();
  if (!session?.refreshToken) {
    throw new Error('Refresh token missing');
  }

  if (!tryAcquireRefreshLock(session.scope)) {
    const externalSession = await waitForExternalRefresh(session.scope, session.refreshToken);
    if (externalSession) return externalSession;
    if (!tryAcquireRefreshLock(session.scope)) {
      throw new Error('Another tab is refreshing the session');
    }
  }

  try {
    const response = await postAuthJson<RefreshResponseShape>(getRefreshEndpoint(session.scope), {
      refreshToken: session.refreshToken,
    });
    const nextSession = normalizeSessionForScope(session.scope, response);
    applySession(nextSession, { broadcastChange: true, isReady: true });
    return nextSession;
  } finally {
    releaseRefreshLock(session.scope);
  }
}

function expireSession() {
  clearSessionInternal({
    expired: true,
    broadcastChange: true,
    redirect: true,
  });
}

export function getAuthSessionState(): AuthSessionState {
  return { ...currentState };
}

export function getAccessToken(): string | null {
  return currentState.accessToken;
}

export function hasRefreshToken(): boolean {
  return Boolean(currentState.refreshToken);
}

export async function initializeAuthSessionManager(): Promise<AuthSessionState> {
  if (initializePromise) return initializePromise;

  ensureSyncListeners();

  initializePromise = (async () => {
    const currentScope = getCurrentAuthScope();
    const storedSession = readStoredSession();

    if (!storedSession || storedSession.scope !== currentScope) {
      clearStoredSession();
      updateStateFromSession(null, true);
      return getAuthSessionState();
    }

    updateStateFromSession(storedSession, false);

    try {
      if (storedSession.refreshToken && (isAccessTokenExpired(storedSession.accessToken) || isAccessTokenStale(storedSession.accessToken))) {
        await ensureFreshSession();
      } else if (!storedSession.refreshToken && isAccessTokenExpired(storedSession.accessToken)) {
        expireSession();
      } else {
        updateStateFromSession(storedSession, true);
      }
    } catch {
      if (storedSession.refreshToken) {
        expireSession();
      } else {
        expireSession();
      }
    }

    currentState = { ...currentState, isReady: true };
    notifyState();
    return getAuthSessionState();
  })();

  return initializePromise;
}

export function subscribeToAuthSession(listener: AuthStateListener): () => void {
  listeners.add(listener);
  listener({ ...currentState });
  return () => {
    listeners.delete(listener);
  };
}

export function storeAuthSession(session: AuthSession): void {
  applySession(session, { broadcastChange: true, isReady: true });
}

export function replaceSessionTokens(tokens: { accessToken: string; refreshToken: string | null }): void {
  const stored = readStoredSession();
  if (!stored) return;
  applySession(
    {
      ...stored,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
    { broadcastChange: true, isReady: true },
  );
}

export async function logoutAuthSession(): Promise<void> {
  const stored = readStoredSession();
  const scope = stored?.scope ?? getCurrentAuthScope();
  const refreshToken = stored?.refreshToken ?? null;

  if (refreshToken) {
    try {
      await postAuthJson(getLogoutEndpoint(scope), { refreshToken });
    } catch {
      /* best effort logout */
    }
  }

  clearSessionInternal({
    expired: false,
    broadcastChange: true,
    redirect: false,
  });
}

export async function ensureFreshSession(): Promise<AuthSession | null> {
  const stored = readStoredSession();
  if (!stored) return null;
  if (!stored.refreshToken) {
    if (isAccessTokenExpired(stored.accessToken)) {
      expireSession();
    }
    return stored;
  }
  if (!isAccessTokenStale(stored.accessToken) && !isAccessTokenExpired(stored.accessToken)) {
    return stored;
  }

  if (!refreshPromise) {
    refreshPromise = performRefresh()
      .catch((error) => {
        expireSession();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}
