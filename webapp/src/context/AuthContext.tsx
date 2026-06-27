import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchApi } from '../api/client';

export type UserRole = 'KTV' | 'ADMIN' | 'DEV' | 'SALE_SUPERVISOR' | 'SALER' | 'HOTLINE' | 'COORDINATOR' | 'STAFF';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  group?: string | null;
  pancakeAccountName?: string | null;
  techStation?: {
    name: string;
    mainStation?: {
      name: string;
    } | null;
  } | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (user: User) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const cached = localStorage.getItem('session_user');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.error('Error parsing cached user', e);
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('session_token');

    // Check session on mount (always call /auth/me to fallback to HttpOnly cookie if localStorage is cleared on iOS/in-app browsers)
    fetchApi('/auth/me')
      .then((data) => {
        setUser(data.user);
        localStorage.setItem('session_user', JSON.stringify(data.user));
        if (data.token) {
          localStorage.setItem('session_token', data.token);
        }
      })
      .catch((err: any) => {
        console.error('Check session error:', err);
        // Only log out if the token is rejected with 401 or 403
        if (err.status === 401 || err.status === 403) {
          localStorage.removeItem('session_token');
          localStorage.removeItem('session_user');
          localStorage.removeItem('cached_ktv_orders');
          setUser(null);
        } else if (!token) {
          // If no token originally and check failed, ensure user state is null
          setUser(null);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem('session_user', JSON.stringify(userData));
  };

  const logout = async () => {
    try {
      await fetchApi('/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error', e);
    } finally {
      localStorage.removeItem('session_token');
      localStorage.removeItem('session_user');
      localStorage.removeItem('cached_ktv_orders');
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
