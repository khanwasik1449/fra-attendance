import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Employee } from '../types';
import { apiClient, extractErrorMessage } from '../lib/api';

interface AuthContextType {
  user: User | null;
  employee: Employee | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isFieldAssistant: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('fams_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [employee, setEmployee] = useState<Employee | null>(() => {
    const saved = localStorage.getItem('fams_employee');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    const token = localStorage.getItem('fams_access_token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await apiClient.get('/auth/me/');
      setUser(res.data.user);
      setEmployee(res.data.employee);
      localStorage.setItem('fams_user', JSON.stringify(res.data.user));
      if (res.data.employee) {
        localStorage.setItem('fams_employee', JSON.stringify(res.data.employee));
      }
    } catch {
      // Token might be invalid
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshMe();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const res = await apiClient.post('/auth/login/', { username, password });
      const { access, refresh, user: userData, employee: empData } = res.data;

      localStorage.setItem('fams_access_token', access);
      localStorage.setItem('fams_refresh_token', refresh);
      localStorage.setItem('fams_user', JSON.stringify(userData));
      if (empData) {
        localStorage.setItem('fams_employee', JSON.stringify(empData));
      }

      setUser(userData);
      setEmployee(empData);
      return { success: true };
    } catch (err) {
      return { success: false, error: extractErrorMessage(err) };
    }
  };

  const logout = () => {
    localStorage.removeItem('fams_access_token');
    localStorage.removeItem('fams_refresh_token');
    localStorage.removeItem('fams_user');
    localStorage.removeItem('fams_employee');
    try {
      document.cookie = 'sessionid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      document.cookie = 'csrftoken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    } catch {}
    setUser(null);
    setEmployee(null);
    window.location.href = '/login';
  };

  const isAdmin = user?.role === 'ADMIN';
  const isFieldAssistant = user?.role === 'FIELD_ASSISTANT';

  return (
    <AuthContext.Provider
      value={{
        user,
        employee,
        isAuthenticated: !!user,
        isAdmin,
        isFieldAssistant,
        login,
        logout,
        refreshMe,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
