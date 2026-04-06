
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface CacheContextType {
  cache: Record<string, any>;
  setCache: (key: string, data: any) => void;
  getCache: (key: string) => any;
  clearCache: (key: string) => void;
}

const CacheContext = createContext<CacheContextType | undefined>(undefined);

export const CacheProvider = ({ children }: { children: ReactNode }) => {
  const [cache, setCacheState] = useState<Record<string, any>>({});

  const setCache = (key: string, data: any) => {
    setCacheState(prev => ({ ...prev, [key]: data }));
  };

  const getCache = (key: string) => {
    return cache[key];
  };

  const clearCache = (key: string) => {
    setCacheState(prev => {
      const newCache = { ...prev };
      delete newCache[key];
      return newCache;
    });
  };

  return (
    <CacheContext.Provider value={{ cache, setCache, getCache, clearCache }}>
      {children}
    </CacheContext.Provider>
  );
};

export const useCache = () => {
  const context = useContext(CacheContext);
  if (!context) {
    throw new Error('useCache must be used within a CacheProvider');
  }
  return context;
};
