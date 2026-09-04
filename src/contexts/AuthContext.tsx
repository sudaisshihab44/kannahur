/**
 * src/contexts/AuthContext.tsx
 *
 * Authentication context with JWT token management.
 *
 * Key fixes applied:
 *
 *  1. NO 401 LOOP — refreshToken() no longer calls logout() on failure.
 *     It simply clears the in-memory token and sets isAuthenticated=false.
 *     The App's polling is gated on accessToken, so it stops automatically.
 *     Users see the login screen; no cascade of retried 401 requests.
 *
 *  2. SINGLE LOGIN REQUEST — login() is a plain async function called once
 *     per button click. No retry logic, no loops.
 *
 *  3. ISLOADING GATE — isLoading stays true until the initial refresh
 *     attempt resolves (success or failure). App.tsx uses this to render
 *     a neutral loader instead of flashing the login screen.
 *
 *  4. REFRESH CALLED ONCE ON MOUNT — the mount useEffect runs once
 *     (empty dep array). It does NOT call logout() on refresh failure
 *     to avoid clearing valid localStorage state before it can be used.
 *
 *  5. TOKEN IN MODULE-LEVEL CACHE — authFetchState.accessToken is kept
 *     in sync so authFetch() works outside React hooks.
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { authFetchState } from '../utils/authFetch';

// ── Types ─────────────────────────────────────────────────────────────────────

interface User {
  id:        string;
  username:  string;
  name?:     string;
  fullName?: string;
  role:      'admin' | 'receptionist';
  portal?:   string;
  isActive:  boolean;
  permissions?: string[];
}

interface AuthContextType {
  user:            User | null;
  accessToken:     string | null;
  isAuthenticated: boolean;
  /** True while the initial session-restore check is in-flight */
  isLoading:       boolean;
  login:           (username: string, password: string, portal: string) => Promise<void>;
  logout:          () => Promise<void>;
  refreshToken:    () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,        setUser]        = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading,   setIsLoading]   = useState(true);

  // Prevent concurrent refresh calls (e.g. from the auto-refresh interval
  // overlapping with a manual call triggered by a 401 response).
  const refreshingRef = useRef(false);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function storeToken(token: string, userData?: User) {
    setAccessToken(token);
    authFetchState.accessToken = token;
    if (userData) {
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
    }
  }

  function clearSession() {
    setAccessToken(null);
    authFetchState.accessToken = null;
    setUser(null);
    localStorage.removeItem('user');
  }

  // ── login ────────────────────────────────────────────────────────────────────

  const login = async (username: string, password: string, portal: string) => {
    const response = await fetch('/api/login', {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ username, password, portal }),
      credentials: 'include',   // receive refreshToken cookie
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'Login failed');
    }

    // Store token in memory + module-level cache; user identity in localStorage
    storeToken(data.accessToken, data.user);
  };

  // ── logout ───────────────────────────────────────────────────────────────────

  const logout = async () => {
    // Best-effort server-side revocation — don't block UI on failure
    if (accessToken) {
      fetch('/api/logout', {
        method:      'POST',
        headers:     { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        credentials: 'include',
      }).catch(() => {});
    }
    clearSession();
  };

  // ── refreshToken ─────────────────────────────────────────────────────────────
  //
  // IMPORTANT — this function must NEVER create a 401 request loop:
  //   - It does NOT call logout() on failure
  //   - It clears the in-memory token on failure so isAuthenticated becomes false
  //   - App.tsx polls /api/data only when accessToken is set, so polling stops
  //   - The user sees the login screen naturally; no retry cascade

  const refreshToken = async () => {
    // Prevent concurrent refresh calls
    if (refreshingRef.current) return;
    refreshingRef.current = true;

    try {
      const response = await fetch('/api/auth/refresh', {
        method:      'POST',
        credentials: 'include',   // sends the refreshToken HTTP-only cookie
      });

      if (!response.ok) {
        // 401 / 429 / 5xx — clear the in-memory token silently.
        // Do NOT call logout() here — that would fire another API request and
        // clear localStorage, which may still hold valid user identity for UX.
        setAccessToken(null);
        authFetchState.accessToken = null;
        return;
      }

      const data = await response.json();

      if (data.success && data.accessToken) {
        storeToken(data.accessToken, data.user);
      } else {
        // Server returned 200 but no token — treat as expired
        setAccessToken(null);
        authFetchState.accessToken = null;
      }
    } catch {
      // Network error — clear token, let user re-authenticate
      setAccessToken(null);
      authFetchState.accessToken = null;
    } finally {
      refreshingRef.current = false;
    }
  };

  // ── Auto-refresh interval ────────────────────────────────────────────────────
  // Refresh 1 minute before the 15-minute access token expires.
  // Only runs when there is an active token — avoids calling /api/auth/refresh
  // unnecessarily when the user is logged out.

  useEffect(() => {
    if (!accessToken) return;
    const id = setInterval(refreshToken, 14 * 60 * 1000);
    return () => clearInterval(id);
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Session restore on mount ─────────────────────────────────────────────────
  // Attempt to restore the session from the HTTP-only refresh token cookie.
  // This fires ONCE. If there is no valid cookie (first visit, cleared cookies,
  // production JWT secrets changed) it sets isLoading=false and the user sees
  // the login screen.
  //
  // Optimistic: pre-populate the user display name from localStorage while
  // the refresh is in-flight so the UI doesn't flash empty.

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('user');
      }
    }

    refreshToken().finally(() => setIsLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Context value ────────────────────────────────────────────────────────────

  const value: AuthContextType = {
    user,
    accessToken,
    isAuthenticated: !!accessToken && !!user,
    isLoading,
    login,
    logout,
    refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
