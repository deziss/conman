import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface Settings {
    refreshInterval: number;
    showTimestamps: boolean;
    density: 'compact' | 'comfortable';
    animationEnabled: boolean;
    themeMode: 'light' | 'dark' | 'system'; // syncing with ThemeContext conceptually
    trivySecurityEnabled: boolean;
    trivySeverityThreshold?: 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

interface SettingsContextType extends Settings {
    updateSettings: (newSettings: Partial<Settings>) => void;
}

const defaultSettings: Settings = {
    refreshInterval: 5000,
    showTimestamps: true,
    density: 'comfortable',
    animationEnabled: true,
    themeMode: 'system',
    trivySecurityEnabled: false, // Default disabled per user requirement
    trivySeverityThreshold: 'ALL'
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
    const [settings, setSettings] = useState<Settings>(() => {
        const saved = localStorage.getItem('conman_settings');
        return saved ? JSON.parse(saved) : defaultSettings;
    });

    useEffect(() => {
        localStorage.setItem('conman_settings', JSON.stringify(settings));
    }, [settings]);

    const updateSettings = (newSettings: Partial<Settings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    return (
        <SettingsContext.Provider value={{ ...settings, updateSettings }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) throw new Error('useSettings must be used within a SettingsProvider');
    return context;
};
