/**
 * src/contexts/AuthContext.tsx
 *
 * Authentication context with JWT token management.
 * Features:
 * - Login/logout with JWT tokens
 * - Automatic token refresh
 * - Session persistence
 * - BACKWARD COMPATIBLE: Works with existing localStorage user storage
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  fullName: string;
  role: 'admin' | 'receptionist';
  portal: string;
  isActive: boolean;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string, portal: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Login with credentials
   */
  const login = async (username: string, password: string, portal: string) => {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, portal }),
      credentials: 'include', // Include cookies for refresh token
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'Login failed');
    }

    // Store access token in React state ONLY — never persisted to localStorage
    // (localStorage is XSS-readable; HTTP-only cookie handles the refresh token)
    setAccessToken(data.accessToken);
    setUser(data.user);
    
    // Persist only non-sensitive user identity (no token)
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  /**
   * Logout and revoke tokens
   */
  const logout = async () => {
    try {
      if (accessToken) {
        await fetch('/api/logout', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });
      }
    } catch (error) {
    }

    // Clear in-memory state and persisted user identity
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem('user');
  };

  /**
   * Refresh access token using refresh token (in HTTP-only cookie)
   */
  const refreshToken = async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include', // Sends refresh token cookie
      });

      const data = await response.json();

      // Token refresh successful — update in-memory state only
      if (data.success && data.accessToken) {
        setAccessToken(data.accessToken);
        // Never write accessToken to localStorage — memory-only
        
        if (data.user) {
          setUser(data.user);
          localStorage.setItem('user', JSON.stringify(data.user));
        }
      } else {
        // Refresh failed, logout
        await logout();
      }
    } catch (error) {
      await logout();
    }
  };

  /**
   * Auto-refresh token before expiry
   * Access tokens expire in 15 minutes, refresh at 14 minutes
   */
  useEffect(() => {
    if (!accessToken) return;

    // Refresh 1 minute before expiry (14 min for 15 min token)
    const refreshInterval = setInterval(() => {
      refreshToken();
    }, 14 * 60 * 1000); // 14 minutes

    return () => clearInterval(refreshInterval);
  }, [accessToken]);

  /**
   * Restore session on mount.
   * Never reads accessToken from localStorage (it is memory-only).
   * Instead, immediately attempt a token refresh using the HTTP-only cookie.
   * If the cookie is present and valid, we get a fresh access token silently.
   */
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser)); // optimistic — UI shows user identity
      } catch {
        localStorage.removeItem('user');
      }
    }

    // Always verify with the server — refresh token in HTTP-only cookie
    refreshToken().finally(() => setIsLoading(false));
  }, []);

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

/**
 * Hook to access auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
