import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    // Check for user token first, then admin token
    const token = localStorage.getItem('user_token') || localStorage.getItem('admin_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // If unauthorized, clear tokens and redirect to login
      const isAdmin = window.location.pathname.startsWith('/admin');
      
      if (isAdmin) {
        localStorage.removeItem('admin_token');
        window.location.href = '/admin';
      } else {
        localStorage.removeItem('user_token');
        // Optional: redirect to login if not already there
        // window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
