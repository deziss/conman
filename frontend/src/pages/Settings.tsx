import { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { Cog6ToothIcon, MoonIcon, SunIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import { Switch } from '@headlessui/react';
import { toast } from 'react-hot-toast';
import { useTheme } from '../contexts/ThemeContext';

export const Settings = () => {
  // Theme State
  const { theme, toggleTheme } = useTheme();
  
  // Refresh Rate (Persisted)
  const [refreshRate, setRefreshRate] = useState(() => {
    return parseInt(localStorage.getItem('conman_refresh_rate') || '3000');
  });

  // API URL
  const [apiUrl, setApiUrl] = useState(import.meta.env.VITE_API_URL || 'http://localhost:8000');

  const handleSaveSettings = () => {
    localStorage.setItem('conman_refresh_rate', refreshRate.toString());
    toast.success('Settings saved successfully');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-500 dark:from-slate-100 dark:to-slate-400">
          Settings
        </h2>
        <button 
            onClick={handleSaveSettings}
            className="flex items-center space-x-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white px-6 py-2 rounded-lg font-medium transition-all shadow-lg shadow-cyan-500/20"
        >
            <Cog6ToothIcon className="w-5 h-5" />
            <span>Save Changes</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Appearance */}
        <GlassCard className="p-6">
            <div className="flex items-center mb-6">
                <div className="p-2 bg-purple-500/10 rounded-lg text-purple-600 dark:text-purple-400 mr-3">
                    <MoonIcon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-200">Appearance</h3>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-800/30 rounded-lg border border-slate-200 dark:border-white/5">
                <div>
                    <h4 className="text-slate-900 dark:text-slate-200 font-medium">Dark Mode</h4>
                    <p className="text-sm text-slate-500">Toggle application dark mode preference</p>
                </div>
                <Switch
                    checked={theme === 'dark'}
                    onChange={toggleTheme}
                    className={`${
                        theme === 'dark' ? 'bg-purple-600' : 'bg-slate-400 dark:bg-slate-700'
                    } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none`}
                >
                    <span className="sr-only">Enable dark mode</span>
                    <span
                        className={`${
                        theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                        } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                    />
                </Switch>
            </div>
        </GlassCard>

        {/* General Settings */}
        <GlassCard className="p-6">
             <div className="flex items-center mb-6">
                <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-600 dark:text-cyan-400 mr-3">
                    <ArrowPathIcon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-200">General</h3>
            </div>

            <div className="space-y-4">
                <div>
                     <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Dashboard Refresh Rate (ms)</label>
                     <select 
                        value={refreshRate}
                        onChange={(e) => setRefreshRate(parseInt(e.target.value))}
                        className="w-full bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                     >
                         <option value="1000">1000 ms (Fast)</option>
                         <option value="3000">3000 ms (Normal)</option>
                         <option value="5000">5000 ms (Slow)</option>
                         <option value="10000">10000 ms (Very Slow)</option>
                     </select>
                     <p className="text-xs text-slate-500 mt-2">Controls how often container stats are updated.</p>
                </div>

                 <div>
                     <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">API Endpoint</label>
                     <input 
                        type="text" 
                        value={apiUrl} 
                        readOnly
                        className="w-full bg-slate-100 dark:bg-slate-800/30 border border-slate-200 dark:border-white/5 rounded-lg px-4 py-2 text-slate-500 cursor-not-allowed" 
                     />
                     <p className="text-xs text-slate-500 mt-2">Connected backend API URL.</p>
                </div>
            </div>
        </GlassCard>

        {/* Application Info */}
        <GlassCard className="p-6 md:col-span-2">
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-200 mb-4">About Conman</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-100 dark:bg-slate-800/30 rounded-lg border border-slate-200 dark:border-white/5">
                    <p className="text-xs text-slate-500 uppercase">Version</p>
                    <p className="text-lg font-mono text-slate-900 dark:text-slate-200">v0.2.0-beta</p>
                </div>
                 <div className="p-4 bg-slate-100 dark:bg-slate-800/30 rounded-lg border border-slate-200 dark:border-white/5">
                    <p className="text-xs text-slate-500 uppercase">Build Identity</p>
                    <p className="text-lg font-mono text-emerald-600 dark:text-emerald-400">Stable</p>
                </div>
                 <div className="p-4 bg-slate-100 dark:bg-slate-800/30 rounded-lg border border-slate-200 dark:border-white/5">
                    <p className="text-xs text-slate-500 uppercase">License</p>
                    <p className="text-lg font-mono text-slate-900 dark:text-slate-200">MIT</p>
                </div>
                <div className="p-4 bg-slate-100 dark:bg-slate-800/30 rounded-lg border border-slate-200 dark:border-white/5">
                    <p className="text-xs text-slate-500 uppercase">React Version</p>
                    <p className="text-lg font-mono text-cyan-600 dark:text-cyan-400">18.2.0</p>
                </div>
            </div>
        </GlassCard>
      </div>
    </div>
  );
};