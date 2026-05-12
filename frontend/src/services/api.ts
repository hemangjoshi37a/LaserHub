import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
// Base URL without /api — used for static assets served by the backend
export const BACKEND_URL = API_URL.replace(/\/api$/, '');

/** Resolve a relative backend media path (e.g. /static/…) to a full URL. */
export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return `${BACKEND_URL}${path}`;
  return path;
}

// Security note: JWTs are stored in localStorage which is accessible to JavaScript
// running in the same origin. This is a known XSS trade-off vs httpOnly cookies
// (which would require same-site server + CSRF tokens). The CSP in index.html and
// the server-side input sanitisation are the primary XSS defences here.

/**
 * Decode a JWT payload without verifying the signature (client-side only check).
 * Actual signature verification always happens on the server.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    // Base64url → Base64 → JSON
    const padded = payload + '=='.slice((payload.length + 2) % 4 || 2);
    const json = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Returns true if the JWT exp claim is in the past. */
function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  const exp = payload['exp'];
  if (typeof exp !== 'number') return false; // no exp claim — trust server
  return Date.now() / 1000 > exp;
}

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000, // 15 second request timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach auth token and check expiry client-side
api.interceptors.request.use(
  (config) => {
    // Check for user token first, then admin token
    const token = localStorage.getItem('user_token') || localStorage.getItem('admin_token');

    if (token) {
      // Client-side expiry pre-check — avoids an unnecessary round-trip
      if (isTokenExpired(token)) {
        localStorage.removeItem('user_token');
        localStorage.removeItem('admin_token');
        // Let the request proceed without auth — server will 401 and the
        // response interceptor below will handle the redirect.
      } else {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: handle 401 (expired/invalid token from server)
// Pages where a 401 redirect would be nonsensical (user is already there, or
// the page is part of the unauth'd flow).
const AUTH_PAGE_PATHS = ['/login', '/register', '/forgot-password', '/verify-email'];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only clear tokens if user_token is expired/invalid (not for permission errors)
      const url = error.config?.url || '';
      const isAdminApi = url.includes('/admin/');
      const hasUserToken = !!localStorage.getItem('user_token');
      let tokensCleared = false;

      if (isAdminApi && hasUserToken) {
        // User token exists but admin API rejected it — don't clear login, just reject
      } else {
        // Clear all auth state
        localStorage.removeItem('user_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('admin_token');
        tokensCleared = true;
      }

      // After clearing auth, redirect to /login with a `next` param preserving
      // the current path + query, unless we're already on an auth-flow page.
      if (tokensCleared && typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        const onAuthPage = AUTH_PAGE_PATHS.some(
          (p) => currentPath === p || currentPath.startsWith(`${p}/`)
        );
        if (!onAuthPage) {
          const next = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.assign(`/login?next=${next}`);
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
