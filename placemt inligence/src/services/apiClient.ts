/**
 * API Client for Placement Intelligence
 * Provides environment-based URL configuration, request timeouts, and secure token management.
 * Sensitive tokens are NEVER stored in LocalStorage.
 */

let inMemoryAccessToken: string | null = (() => {
  try {
    return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token') || null;
  } catch {
    return null;
  }
})();
let tokenGetter: ((forceRefresh?: boolean) => Promise<string | null>) | null = null;

export const setAccessToken = (token: string | null) => {
  inMemoryAccessToken = token;
  try {
    if (token) {
      sessionStorage.setItem('auth_token', token);
      localStorage.setItem('auth_token', token);
    } else {
      sessionStorage.removeItem('auth_token');
      localStorage.removeItem('auth_token');
    }
  } catch {
    // Non-blocking storage access error
  }
};

export const setTokenGetter = (getter: (forceRefresh?: boolean) => Promise<string | null>) => {
  tokenGetter = getter;
};

export const getAccessToken = (): string | null => {
  return inMemoryAccessToken;
};

export const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || '/api/v1';

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const DEFAULT_TIMEOUT_MS = 40000;

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  // If no token in memory, attempt resolution via registered tokenGetter
  if (!inMemoryAccessToken && tokenGetter) {
    try {
      inMemoryAccessToken = await tokenGetter(false);
    } catch {
      // Ignore
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (inMemoryAccessToken) {
    headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const config: RequestInit = {
    ...options,
    headers,
    signal: options.signal || controller.signal,
    credentials: 'include',
  };

  try {
    const response = await fetch(url, config);
    clearTimeout(timeoutId);

    if (response.status === 204) {
      return {} as T;
    }

    // Auto-retry once on 401 by force-refreshing token
    if (response.status === 401 && !isRetry && tokenGetter) {
      try {
        const refreshedToken = await tokenGetter(true);
        if (refreshedToken) {
          inMemoryAccessToken = refreshedToken;
          return await request<T>(endpoint, options, true);
        }
      } catch {
        // Fall through to error
      }
    }

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg =
        json?.detail || json?.message || `Request failed with status ${response.status}`;
      throw new ApiError(response.status, errorMsg, json);
    }

    return json as T;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error?.name === 'AbortError') {
      throw new ApiError(408, 'Request timed out. Please check backend connection.');
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(0, error?.message || 'Network connection error');
  }
}

export const apiClient = {
  get: <T>(endpoint: string, headers?: Record<string, string>) =>
    request<T>(endpoint, { method: 'GET', headers }),

  post: <T>(endpoint: string, body?: any, headers?: Record<string, string>) =>
    request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      headers,
    }),

  put: <T>(endpoint: string, body?: any, headers?: Record<string, string>) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      headers,
    }),

  patch: <T>(endpoint: string, body?: any, headers?: Record<string, string>) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
      headers,
    }),

  delete: <T>(endpoint: string, headers?: Record<string, string>) =>
    request<T>(endpoint, { method: 'DELETE', headers }),

  upload: async <T>(endpoint: string, formData: FormData): Promise<T> => {
    const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    if (!inMemoryAccessToken && tokenGetter) {
      try {
        inMemoryAccessToken = await tokenGetter(false);
      } catch {
        // Ignore
      }
    }
    const headers: Record<string, string> = {};
    if (inMemoryAccessToken) {
      headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s for file uploads
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new ApiError(response.status, json?.detail || 'Upload failed', json);
      }
      return json as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        throw new ApiError(408, 'Upload timed out. Please try again.');
      }
      if (err instanceof ApiError) throw err;
      throw new ApiError(0, err?.message || 'Upload connection error');
    }
  },
};
