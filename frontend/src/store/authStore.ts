import { create } from 'zustand';
import type { AxiosError } from 'axios';
import { User, authApi } from '../services';

export interface RegisterPayload {
  email: string;
  name: string;
  password: string;
  role?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;
  error: string | null;

  // Actions
  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (userData: RegisterPayload) => Promise<void>;
  checkAuth: () => Promise<void>;
}

// Restore cached user from localStorage for instant UI (avoids flash of logged-out state)
function getCachedUser(): User | null {
  try {
    const raw = localStorage.getItem('user_data');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const cachedUser = getCachedUser();

// If we have a cached user, we start with isLoading=true because checkAuth()
// will be triggered on mount to verify the token. This prevents pages from
// redirecting to /login while we're still validating the cached session.
const hasToken = typeof localStorage !== 'undefined' && !!localStorage.getItem('user_token');

export const useAuthStore = create<AuthState>((set) => ({
  user: cachedUser,
  isAuthenticated: !!cachedUser,
  isLoading: hasToken,
  hasHydrated: false,
  error: null,

  setUser: (user) => {
    if (user) {
      localStorage.setItem('user_data', JSON.stringify(user));
    } else {
      localStorage.removeItem('user_data');
    }
    set({ user, isAuthenticated: !!user });
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(email, password);
      localStorage.setItem('user_token', response.access_token);
      const user = await authApi.getMe();
      localStorage.setItem('user_data', JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      const axErr = err as AxiosError<{ detail?: string }>;
      set({
        error: axErr.response?.data?.detail || 'Login failed',
        isLoading: false
      });
      throw err;
    }
  },

  register: async (userData) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.register(userData);
      set({ isLoading: false });
    } catch (err) {
      const axErr = err as AxiosError<{ detail?: string }>;
      set({
        error: axErr.response?.data?.detail || 'Registration failed',
        isLoading: false
      });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('user_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('admin_token');
    set({ user: null, isAuthenticated: false, hasHydrated: true });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('user_token');
    if (!token) {
      // Explicitly clear any stale in-memory state even if cachedUser was populated
      localStorage.removeItem('user_data');
      set({ user: null, isAuthenticated: false, isLoading: false, hasHydrated: true });
      return;
    }

    set({ isLoading: true });
    try {
      const user = await authApi.getMe();
      localStorage.setItem('user_data', JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false, hasHydrated: true });
    } catch (err) {
      localStorage.removeItem('user_token');
      localStorage.removeItem('user_data');
      set({ user: null, isAuthenticated: false, isLoading: false, hasHydrated: true });
    }
  }
}));

// Cross-tab / direct-localStorage sync: if the token is cleared elsewhere
// (another tab, devtools, or a logout in a sibling window), log out immediately
// so the in-memory Zustand state doesn't desync from storage.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'user_token' && !e.newValue) {
      useAuthStore.getState().logout();
    }
    if (e.key === null) {
      // localStorage.clear() fires a storage event with key=null
      if (!localStorage.getItem('user_token')) {
        useAuthStore.getState().logout();
      }
    }
  });
}
