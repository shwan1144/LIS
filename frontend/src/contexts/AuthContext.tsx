import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import type { UserDto, LabDto } from '../api/client';
import { getCurrentAuthScope, type AuthScope } from '../utils/tenant-scope';

const SHIFT_STORAGE_PREFIX = 'lis_shift_';

function clearPersistedAuthStorage() {
  localStorage.removeItem('accessToken');
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
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
      return null;
    }
    return payload.exp;
  } catch {
    return null;
  }
}

interface AuthState {
  user: UserDto | null;
  lab: LabDto | null;
  scope: AuthScope | null;
  token: string | null;
  isReady: boolean;
  currentShiftId: string | null;
  currentShiftLabel: string | null;
}

interface AuthContextValue extends AuthState {
  login: (session: { user: UserDto; lab: LabDto | null; token: string; scope: AuthScope }) => void;
  logout: () => void;
  setCurrentShift: (shiftId: string | null, label: string | null) => void;
  setAccessToken: (token: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const platformExpiryTimerRef = useRef<number | null>(null);
  const [state, setState] = useState<AuthState>({
    user: null,
    lab: null,
    scope: null,
    token: null,
    isReady: false,
    currentShiftId: null,
    currentShiftLabel: null,
  });

  useEffect(() => {
    const currentScope = getCurrentAuthScope();
    const token = localStorage.getItem('accessToken');
    const userStr = localStorage.getItem('user');
    const labStr = localStorage.getItem('lab');
    const scopeStr = (localStorage.getItem('authScope') as AuthScope | null) ?? 'LAB';

    if (scopeStr !== currentScope) {
      clearPersistedAuthStorage();
      setState((s) => ({ ...s, isReady: true, scope: currentScope }));
      return;
    }

    if (token && userStr) {
      try {
        let currentShiftId: string | null = null;
        let currentShiftLabel: string | null = null;
        let lab: LabDto | null = null;

        if (scopeStr === 'LAB') {
          if (!labStr) {
            throw new Error('Missing lab for lab scope session');
          }
          lab = JSON.parse(labStr) as LabDto;
          const shiftKey = `${SHIFT_STORAGE_PREFIX}${lab.id}`;
          const shiftStr = localStorage.getItem(shiftKey);
          if (shiftStr) {
            try {
              const { shiftId, label } = JSON.parse(shiftStr) as { shiftId: string; label: string };
              currentShiftId = shiftId ?? null;
              currentShiftLabel = label ?? null;
            } catch {
              /* ignore */
            }
          }
        }

        setState({
          token,
          user: JSON.parse(userStr) as UserDto,
          lab,
          scope: scopeStr,
          isReady: true,
          currentShiftId,
          currentShiftLabel,
        });
      } catch {
        clearPersistedAuthStorage();
        setState((s) => ({ ...s, isReady: true, scope: currentScope }));
      }
    } else {
      setState((s) => ({ ...s, isReady: true, scope: currentScope }));
    }
  }, []);

  const clearPlatformExpiryTimer = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (platformExpiryTimerRef.current !== null) {
      window.clearTimeout(platformExpiryTimerRef.current);
      platformExpiryTimerRef.current = null;
    }
  }, []);

  const login = useCallback((session: { user: UserDto; lab: LabDto | null; token: string; scope: AuthScope }) => {
    localStorage.setItem('accessToken', session.token);
    localStorage.setItem('user', JSON.stringify(session.user));
    localStorage.setItem('authScope', session.scope);

    let currentShiftId: string | null = null;
    let currentShiftLabel: string | null = null;

    if (session.scope === 'LAB' && session.lab) {
      localStorage.setItem('lab', JSON.stringify(session.lab));
      const shiftKey = `${SHIFT_STORAGE_PREFIX}${session.lab.id}`;
      const shiftStr = localStorage.getItem(shiftKey);
      if (shiftStr) {
        try {
          const { shiftId, label } = JSON.parse(shiftStr) as { shiftId: string; label: string };
          currentShiftId = shiftId ?? null;
          currentShiftLabel = label ?? null;
        } catch {
          /* ignore */
        }
      }
    } else {
      localStorage.removeItem('lab');
    }

    setState({
      user: session.user,
      lab: session.lab,
      scope: session.scope,
      token: session.token,
      isReady: true,
      currentShiftId,
      currentShiftLabel,
    });
  }, []);

  const logout = useCallback(() => {
    clearPlatformExpiryTimer();
    clearPersistedAuthStorage();
    setState((s) => ({
      ...s,
      user: null,
      lab: null,
      scope: getCurrentAuthScope(),
      token: null,
      currentShiftId: null,
      currentShiftLabel: null,
    }));
  }, [clearPlatformExpiryTimer]);

  const setCurrentShift = useCallback((shiftId: string | null, label: string | null) => {
    setState((s) => {
      if (!s.lab) return s;
      const key = `${SHIFT_STORAGE_PREFIX}${s.lab.id}`;
      if (shiftId == null) {
        localStorage.removeItem(key);
        return { ...s, currentShiftId: null, currentShiftLabel: null };
      }
      localStorage.setItem(key, JSON.stringify({ shiftId, label: label ?? '' }));
      return { ...s, currentShiftId: shiftId, currentShiftLabel: label };
    });
  }, []);

  const setAccessToken = useCallback((token: string) => {
    localStorage.setItem('accessToken', token);
    setState((s) => ({ ...s, token }));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    clearPlatformExpiryTimer();

    if (!state.isReady || state.scope !== 'PLATFORM' || !state.token) {
      return;
    }

    const expSeconds = decodeJwtExpSeconds(state.token);
    if (!expSeconds) return;

    const expiresAtMs = expSeconds * 1000;
    const delayMs = expiresAtMs - Date.now();

    const expireSession = () => {
      sessionStorage.setItem('sessionExpired', '1');
      clearPersistedAuthStorage();
      setState((s) => ({
        ...s,
        user: null,
        lab: null,
        scope: getCurrentAuthScope(),
        token: null,
        currentShiftId: null,
        currentShiftLabel: null,
      }));
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    };

    if (delayMs <= 0) {
      expireSession();
      return;
    }

    platformExpiryTimerRef.current = window.setTimeout(expireSession, delayMs);

    return () => {
      clearPlatformExpiryTimer();
    };
  }, [clearPlatformExpiryTimer, state.isReady, state.scope, state.token]);

  const value: AuthContextValue = { ...state, login, logout, setCurrentShift, setAccessToken };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
