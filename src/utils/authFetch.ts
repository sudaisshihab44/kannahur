/**
 * src/utils/authFetch.ts
 *
 * Drop-in authenticated fetch wrapper.
 *
 * Usage (in any component):
 *   import { authFetch } from '../utils/authFetch';
 *   const res = await authFetch('/api/admin/doctors', { method: 'POST', body: ... });
 *
 * Automatically attaches the JWT Bearer token from localStorage when available,
 * falling back to the x-operator-username legacy header from localStorage user.
 *
 * This is intentionally NOT a React hook so it can be called from plain async
 * functions inside event handlers without violating Rules of Hooks.
 */

function getAuthHeaders(): Record<string, string> {
  // Try JWT access token first (stored in memory via AuthContext)
  // We can't access React state from outside a component/hook, so we use
  // a module-level cache that AuthContext writes to on login/refresh.
  const token = authFetchState.accessToken;
  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }

  // Legacy fallback: x-operator-username from localStorage
  const storedUser = localStorage.getItem('user');
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      if (user?.username) {
        return { 'X-Operator-Username': user.username };
      }
    } catch {
      // ignore
    }
  }

  return {};
}

// Module-level token store — written by AuthContext, read by authFetch
export const authFetchState = {
  accessToken: null as string | null,
};

/**
 * Authenticated fetch — mirrors the standard fetch API.
 * Merges auth headers into the request automatically.
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const authHeaders = getAuthHeaders();

  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...authHeaders,
      ...(options.headers as Record<string, string> ?? {}),
    },
  });
}
