import { create } from 'zustand';
import { User, authApi } from '../services';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (userData: any) => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  
  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(email, password);
      localStorage.setItem('user_token', response.access_token);
      const user = await authApi.getMe();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ 
        error: err.response?.data?.detail || 'Login failed', 
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
    } catch (err: any) {
      set({ 
        error: err.response?.data?.detail || 'Registration failed', 
        isLoading: false 
      });
      throw err;
    }
  },
  
  logout: () => {
    localStorage.removeItem('user_token');
    set({ user: null, isAuthenticated: false });
  },
  
  checkAuth: async () => {
    const token = localStorage.getItem('user_token');
    if (!token) {
      set({ isAuthenticated: false, isLoading: false });
      return;
    }
    
    set({ isLoading: true });
    try {
      const user = await authApi.getMe();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      localStorage.removeItem('user_token');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  }
}));
