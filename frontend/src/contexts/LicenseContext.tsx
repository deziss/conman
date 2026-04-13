import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import api from '../services/api';
import { LicenseInfo, LicenseTier } from '../types/license';

interface LicenseContextType {
  license: LicenseInfo | null;
  loading: boolean;
  refreshLicense: () => Promise<void>;
  activateLicense: (key: string) => Promise<LicenseInfo>;
  deactivateLicense: () => Promise<void>;
  hasFeature: (feature: string) => boolean;
  isProOrAbove: boolean;
  isEnterprise: boolean;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

export const LicenseProvider = ({ children }: { children: ReactNode }) => {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLicense = useCallback(async () => {
    try {
      const { data } = await api.get('/license');
      setLicense(data);
    } catch (error) {
      console.error('Failed to fetch license info', error);
      // Default to community on failure
      setLicense({
        tier: 'community',
        valid: true,
        max_hosts: 1,
        current_hosts: 0,
        features: [],
        expiry: null,
        grace_period: false,
        grace_period_end: null,
        last_validated: new Date().toISOString(),
        error: 'Failed to fetch license info',
        license_key_masked: '',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLicense();
    const interval = setInterval(fetchLicense, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchLicense]);

  const refreshLicense = useCallback(async () => {
    setLoading(true);
    await fetchLicense();
  }, [fetchLicense]);

  const activateLicense = useCallback(async (key: string): Promise<LicenseInfo> => {
    const { data } = await api.post('/license/activate', { license_key: key });
    setLicense(data);
    return data;
  }, []);

  const deactivateLicense = useCallback(async () => {
    const { data } = await api.post('/license/deactivate');
    setLicense(data);
  }, []);

  const hasFeature = useCallback((feature: string): boolean => {
    if (!license) return false;
    return license.features.includes(feature);
  }, [license]);

  const isProOrAbove = license?.tier === 'pro' || license?.tier === 'enterprise';
  const isEnterprise = license?.tier === 'enterprise';

  return (
    <LicenseContext.Provider value={{
      license,
      loading,
      refreshLicense,
      activateLicense,
      deactivateLicense,
      hasFeature,
      isProOrAbove,
      isEnterprise,
    }}>
      {children}
    </LicenseContext.Provider>
  );
};

export const useLicense = (): LicenseContextType => {
  const context = useContext(LicenseContext);
  if (!context) {
    throw new Error('useLicense must be used within a LicenseProvider');
  }
  return context;
};
