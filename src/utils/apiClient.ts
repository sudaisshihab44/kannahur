/**
 * src/utils/apiClient.ts
 *
 * API client with automatic JWT token refresh.
 * Features:
 * - Automatic token injection via authFetchState (module-level cache written
 *   by AuthContext — NOT localStorage, which AuthContext never uses for tokens)
 * - Auto-refresh on 401 errors via the HTTP-only refreshToken cookie
 * - BACKWARD COMPATIBLE: Falls back to x-operator-username if no JWT token
 *
 * IMPORTANT: The access token is stored ONLY in:
 *   1. React state (AuthContext.accessToken)
 *   2. authFetchState.accessToken  ← module-level cache, readable here
 * It is NOT stored in localStorage under any key.
 * Previously this file read localStorage.getItem('accessToken') which always
 * returned null, causing every request to go out unauthenticated and then
 * blow up the session via window.location.href on the resulting 401.
 */

import { authFetchState } from './authFetch';

const API_BASE = '';

interface ApiClientOptions extends RequestInit {
  skipAuth?: boolean;
  useLegacyAuth?: boolean;
}

/**
 * Make an authenticated API request with automatic token refresh.
 */
async function apiClient(
  endpoint: string,
  options: ApiClientOptions = {}
): Promise<any> {
  const { skipAuth = false, useLegacyAuth = false, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string> ?? {}),
  };

  // ── Attach auth headers ───────────────────────────────────────────────────
  if (!skipAuth) {
    if (useLegacyAuth) {
      // Legacy: x-operator-username (kept for backward compatibility)
      const raw = localStorage.getItem('user');
      if (raw) {
        try {
          const u = JSON.parse(raw);
          if (u?.username) headers['x-operator-username'] = u.username;
        } catch { /* ignore */ }
      }
    } else {
      // JWT: read from module-level cache written by AuthContext.storeToken().
      // AuthContext never writes to localStorage for the access token — it
      // lives only in React state and this shared module-level object.
      const token = authFetchState.accessToken;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        // Graceful fallback to legacy header so unauthenticated requests
        // still work during the brief window before AuthContext hydrates.
        const raw = localStorage.getItem('user');
        if (raw) {
          try {
            const u = JSON.parse(raw);
            if (u?.username) headers['x-operator-username'] = u.username;
          } catch { /* ignore */ }
        }
      }
    }
  }

  // ── First attempt ─────────────────────────────────────────────────────────
  let response = await fetch(API_BASE + endpoint, {
    ...fetchOptions,
    headers,
    credentials: 'include', // send refreshToken HTTP-only cookie
  });

  // ── 401 handling: attempt a silent token refresh then retry ONCE ──────────
  if (response.status === 401 && !skipAuth && !useLegacyAuth) {
    const refreshResponse = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });

    let refreshData: any = {};
    try { refreshData = await refreshResponse.json(); } catch { /* ignore */ }

    if (refreshData.success && refreshData.accessToken) {
      // Write back into the shared cache so subsequent calls use the new token.
      authFetchState.accessToken = refreshData.accessToken;
      if (refreshData.user) {
        localStorage.setItem('user', JSON.stringify(refreshData.user));
      }

      // Retry the original request with the refreshed token.
      headers['Authorization'] = `Bearer ${refreshData.accessToken}`;
      response = await fetch(API_BASE + endpoint, {
        ...fetchOptions,
        headers,
        credentials: 'include',
      });
    } else {
      // Refresh failed — clear the stale cache entry and throw so the caller
      // (or AuthContext's auto-refresh) can show the login screen cleanly.
      // DO NOT call window.location.href here — that causes a hard reload that
      // destroys React state and bypasses AuthContext's session management.
      authFetchState.accessToken = null;
      throw new Error('Session expired. Please log in again.');
    }
  }

  // Parse response
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }

  return response;
}

/**
 * GET request
 */
export async function get(endpoint: string, options?: ApiClientOptions): Promise<any> {
  return apiClient(endpoint, { ...options, method: 'GET' });
}

/**
 * POST request
 */
export async function post(endpoint: string, body?: any, options?: ApiClientOptions): Promise<any> {
  return apiClient(endpoint, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT request
 */
export async function put(endpoint: string, body?: any, options?: ApiClientOptions): Promise<any> {
  return apiClient(endpoint, {
    ...options,
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE request
 */
export async function del(endpoint: string, options?: ApiClientOptions): Promise<any> {
  return apiClient(endpoint, { ...options, method: 'DELETE' });
}

/**
 * PATCH request
 */
export async function patch(endpoint: string, body?: any, options?: ApiClientOptions): Promise<any> {
  return apiClient(endpoint, {
    ...options,
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export default {
  get,
  post,
  put,
  delete: del,
  patch,
};
