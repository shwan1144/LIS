import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { UserDto, LabDto } from '../api/client';

const SHIFT_STORAGE_PREFIX = 'lis_shift_';

interface AuthState {
  user: UserDto | null;
  lab: LabDto | null;
  token: string | null;
  isReady: boolean;
  currentShiftId: string | null;
  currentShiftLabel: string | null;
}

interface AuthContextValue extends AuthState {
  login: (user: UserDto, lab: LabDto, token: string) => void;
  logout: () => void;
  setCurrentShift: (shiftId: string | null, label: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    lab: null,
    token: null,
    isReady: false,
    currentShiftId: null,
    currentShiftLabel: null,
  });

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const userStr = localStorage.getItem('user');
    const labStr = localStorage.getItem('lab');
    if (token && userStr && labStr) {
      try {
        const lab = JSON.parse(labStr) as LabDto;
        const shiftKey = `${SHIFT_STORAGE_PREFIX}${lab.id}`;
        const shiftStr = localStorage.getItem(shiftKey);
        let currentShiftId: string | null = null;
        let currentShiftLabel: string | null = null;
        if (shiftStr) {
          try {
            const { shiftId, label } = JSON.parse(shiftStr) as { shiftId: string; label: string };
            currentShiftId = shiftId ?? null;
            currentShiftLabel = label ?? null;
          } catch {
            /* ignore */
          }
        }
        setState({
          token,
          user: JSON.parse(userStr) as UserDto,
          lab,
          isReady: true,
          currentShiftId,
          currentShiftLabel,
        });
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        localStorage.removeItem('lab');
        setState((s) => ({ ...s, isReady: true }));
      }
    } else {
      setState((s) => ({ ...s, isReady: true }));
    }
  }, []);

  const login = useCallback((user: UserDto, lab: LabDto, token: string) => {
    localStorage.setItem('accessToken', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('lab', JSON.stringify(lab));
    const shiftKey = `${SHIFT_STORAGE_PREFIX}${lab.id}`;
    const shiftStr = localStorage.getItem(shiftKey);
    let currentShiftId: string | null = null;
    let currentShiftLabel: string | null = null;
    if (shiftStr) {
      try {
        const { shiftId, label } = JSON.parse(shiftStr) as { shiftId: string; label: string };
        currentShiftId = shiftId ?? null;
        currentShiftLabel = label ?? null;
      } catch {
        /* ignore */
      }
    }
    setState({ user, lab, token, isReady: true, currentShiftId, currentShiftLabel });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    localStorage.removeItem('lab');
    setState((s) => ({ ...s, user: null, lab: null, token: null, currentShiftId: null, currentShiftLabel: null }));
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

  const value: AuthContextValue = { ...state, login, logout, setCurrentShift };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
