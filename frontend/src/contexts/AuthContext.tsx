import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../services/api';

interface User {
  name: string;
  email: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (token: string, userInfo?: { name?: string; email?: string }) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to decode JWT token payload
const decodeToken = (token: string): Record<string, any> | null => {
  try {
    const base64Payload = token.split('.')[1];
    const payload = atob(base64Payload);
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

// Helper to get initials from a name
export const getInitials = (name: string | null | undefined): string => {
  if (!name || typeof name !== 'string') return 'U';
  const trimmed = name.trim();
  if (!trimmed) return 'U';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (token) {
      setIsAuthenticated(true);
      
      // Try to load user from localStorage first
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch {
          // If parsing fails, try to decode from token
          const decoded = decodeToken(token);
          if (decoded) {
            const userInfo = {
              name: decoded.name || decoded.username || decoded.sub || 'User',
              email: decoded.email || decoded.username || '',
            };
            setUser(userInfo);
            localStorage.setItem('user', JSON.stringify(userInfo));
          }
        }
      } else {
        // Decode user info from token
        const decoded = decodeToken(token);
        if (decoded) {
          const userInfo = {
            name: decoded.name || decoded.username || decoded.sub || 'User',
            email: decoded.email || decoded.username || '',
          };
          setUser(userInfo);
          localStorage.setItem('user', JSON.stringify(userInfo));
        }
      }
    }
    setLoading(false);
  }, []);

  const login = (token: string, userInfo?: { name?: string; email?: string }) => {
    localStorage.setItem('token', token);
    setIsAuthenticated(true);
    
    // Decode token to get user info if not provided
    const decoded = decodeToken(token);
    const finalUser = {
      name: userInfo?.name || decoded?.name || decoded?.username || decoded?.sub || 'User',
      email: userInfo?.email || decoded?.email || decoded?.username || '',
    };
    
    setUser(finalUser);
    localStorage.setItem('user', JSON.stringify(finalUser));
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, loading }}>
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