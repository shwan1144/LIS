import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { UserDto, LabDto } from '../api/client';
import { getCurrentAuthScope, type AuthScope } from '../utils/tenant-scope';

const SHIFT_STORAGE_PREFIX = 'lis_shift_';

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
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      localStorage.removeItem('lab');
      localStorage.removeItem('authScope');
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
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        localStorage.removeItem('lab');
        localStorage.removeItem('authScope');
        setState((s) => ({ ...s, isReady: true, scope: currentScope }));
      }
    } else {
      setState((s) => ({ ...s, isReady: true, scope: currentScope }));
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
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    localStorage.removeItem('lab');
    localStorage.removeItem('authScope');
    setState((s) => ({
      ...s,
      user: null,
      lab: null,
      scope: getCurrentAuthScope(),
      token: null,
      currentShiftId: null,
      currentShiftLabel: null,
    }));
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

  const setAccessToken = useCallback((token: string) => {
    localStorage.setItem('accessToken', token);
    setState((s) => ({ ...s, token }));
  }, []);

  const value: AuthContextValue = { ...state, login, logout, setCurrentShift, setAccessToken };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
