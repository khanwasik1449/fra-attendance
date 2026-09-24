import axios, { AxiosError } from 'axios';

const API_BASE_URL = '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Request interceptor injecting JWT and CSRF token if present
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('fams_access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const csrfToken = getCsrfToken();
    if (csrfToken && config.headers) {
      config.headers['X-CSRFToken'] = csrfToken;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor handling 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('fams_refresh_token');
      if (refreshToken) {
        try {
          const res = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
            refresh: refreshToken,
          });
          const newAccess = res.data.access;
          localStorage.setItem('fams_access_token', newAccess);
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newAccess}`;
          }
          return apiClient(originalRequest);
        } catch (refreshErr) {
          localStorage.removeItem('fams_access_token');
          localStorage.removeItem('fams_refresh_token');
          localStorage.removeItem('fams_user');
          localStorage.removeItem('fams_employee');
          window.location.href = '/login';
        }
      } else {
        localStorage.removeItem('fams_access_token');
        localStorage.removeItem('fams_user');
        localStorage.removeItem('fams_employee');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data) {
      if (typeof data === 'string') return data;
      if (data.detail) return data.detail;
      if (data.non_field_errors && data.non_field_errors.length > 0) return data.non_field_errors[0];
      const firstKey = Object.keys(data)[0];
      if (firstKey) {
        const val = data[firstKey];
        if (Array.isArray(val) && val.length > 0) return `${firstKey}: ${val[0]}`;
        return `${firstKey}: ${val}`;
      }
    }
    return error.message || 'An unexpected error occurred. Please try again.';
  }
  return 'Network error. Please check connection.';
}
