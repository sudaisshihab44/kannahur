/**
 * src/utils/apiClient.ts
 *
 * API client with automatic JWT token refresh.
 * Features:
 * - Automatic token injection
 * - Auto-refresh on 401 errors
 * - BACKWARD COMPATIBLE: Falls back to x-operator-username if no token
 */

const API_BASE = '';

interface ApiClientOptions extends RequestInit {
  skipAuth?: boolean;
  useLegacyAuth?: boolean;
}

/**
 * Make an authenticated API request with automatic token refresh
 */
async function apiClient(
  endpoint: string,
  options: ApiClientOptions = {}
): Promise<any> {
  const { skipAuth = false, useLegacyAuth = false, ...fetchOptions } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers,
  };

  // Add authentication headers
  if (!skipAuth) {
    if (useLegacyAuth) {
      // Legacy authentication: x-operator-username header
      const user = localStorage.getItem('user');
      if (user) {
        const parsedUser = JSON.parse(user);
        headers['x-operator-username'] = parsedUser.username;
      }
    } else {
      // JWT authentication: Bearer token
      const accessToken = localStorage.getItem('accessToken');
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
    }
  }

  // First attempt
  let response = await fetch(API_BASE + endpoint, {
    ...fetchOptions,
    headers,
    credentials: 'include', // Include cookies for refresh token
  });

  // If token expired (401), try to refresh and retry
  if (response.status === 401 && !skipAuth && !useLegacyAuth) {
    console.log('[apiClient] Token expired, attempting refresh...');

    const refreshResponse = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });

    const refreshData = await refreshResponse.json();

    if (refreshData.success && refreshData.accessToken) {
      // Update stored token
      localStorage.setItem('accessToken', refreshData.accessToken);
      
      // Update user data if provided
      if (refreshData.user) {
        localStorage.setItem('user', JSON.stringify(refreshData.user));
      }

      // Retry original request with new token
      headers['Authorization'] = `Bearer ${refreshData.accessToken}`;

      response = await fetch(API_BASE + endpoint, {
        ...fetchOptions,
        headers,
        credentials: 'include',
      });

      console.log('[apiClient] Token refreshed, request retried');
    } else {
      // Refresh failed, redirect to login
      console.warn('[apiClient] Token refresh failed, redirecting to login');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      window.location.href = '/';
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
