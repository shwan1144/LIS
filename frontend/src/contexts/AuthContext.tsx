import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { UserDto, LabDto } from '../api/client';
import {
  getAuthSessionState,
  initializeAuthSessionManager,
  logoutAuthSession,
  replaceSessionTokens,
  storeAuthSession,
  subscribeToAuthSession,
  type AuthSession,
  type AuthSessionState,
} from '../auth/sessionManager';
import { getCurrentAuthScope, type AuthScope } from '../utils/tenant-scope';

const SHIFT_STORAGE_PREFIX = 'lis_shift_';

function getStoredShift(lab: LabDto | null): { shiftId: string | null; label: string | null } {
  if (!lab || typeof window === 'undefined') {
    return { shiftId: null, label: null };
  }

  const shiftKey = `${SHIFT_STORAGE_PREFIX}${lab.id}`;
  const shiftStr = localStorage.getItem(shiftKey);
  if (!shiftStr) {
    return { shiftId: null, label: null };
  }

  try {
    const { shiftId, label } = JSON.parse(shiftStr) as { shiftId: string; label: string };
    return {
      shiftId: shiftId ?? null,
      label: label ?? null,
    };
  } catch {
    return { shiftId: null, label: null };
  }
}

function mapSessionState(sessionState: AuthSessionState) {
  const { shiftId, label } = getStoredShift(sessionState.scope === 'LAB' ? sessionState.lab : null);
  return {
    accessToken: sessionState.accessToken,
    refreshToken: sessionState.refreshToken,
    user: sessionState.user,
    lab: sessionState.lab,
    scope: sessionState.scope ?? getCurrentAuthScope(),
    isReady: sessionState.isReady,
    currentShiftId: shiftId,
    currentShiftLabel: label,
  };
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserDto | null;
  lab: LabDto | null;
  scope: AuthScope | null;
  isReady: boolean;
  currentShiftId: string | null;
  currentShiftLabel: string | null;
}

interface AuthContextValue extends AuthState {
  login: (session: {
    user: UserDto;
    lab: LabDto | null;
    accessToken: string;
    refreshToken: string;
    scope: AuthScope;
  }) => void;
  logout: () => Promise<void>;
  setCurrentShift: (shiftId: string | null, label: string | null) => void;
  replaceTokens: (tokens: { accessToken: string; refreshToken: string | null }) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => mapSessionState(getAuthSessionState()));

  useEffect(() => {
    const unsubscribe = subscribeToAuthSession((nextState) => {
      setState(mapSessionState(nextState));
    });

    void initializeAuthSessionManager().then((nextState) => {
      setState(mapSessionState(nextState));
    });

    return unsubscribe;
  }, []);

  const login = useCallback((session: {
    user: UserDto;
    lab: LabDto | null;
    accessToken: string;
    refreshToken: string;
    scope: AuthScope;
  }) => {
    const nextSession: AuthSession = {
      user: session.user,
      lab: session.lab,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      scope: session.scope,
    };
    storeAuthSession(nextSession);
  }, []);

  const logout = useCallback(async () => {
    await logoutAuthSession();
  }, []);

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

  const replaceTokensCallback = useCallback((tokens: { accessToken: string; refreshToken: string | null }) => {
    replaceSessionTokens(tokens);
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    setCurrentShift,
    replaceTokens: replaceTokensCallback,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
