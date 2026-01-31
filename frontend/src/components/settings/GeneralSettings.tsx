import { useSettings } from '../../contexts/SettingsContext';
import { useTheme } from '../../contexts/ThemeContext';
import { GlassCard } from '../ui/GlassCard';
import { Switch, Listbox, Transition } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon, MoonIcon, SunIcon, ComputerDesktopIcon } from '@heroicons/react/24/solid';
import { Fragment } from 'react';

const REFRESH_OPTIONS = [
    { name: '2 Seconds', value: 2000 },
    { name: '5 Seconds', value: 5000 },
    { name: '10 Seconds', value: 10000 },
    { name: '30 Seconds', value: 30000 },
    { name: '1 Minute', value: 60000 },
];

export const GeneralSettings = () => {
    const { refreshInterval, showTimestamps, density, animationEnabled, themeMode, updateSettings } = useSettings();
    const { setTheme } = useTheme();

    const handleThemeChange = (mode: 'light' | 'dark' | 'system') => {
        updateSettings({ themeMode: mode });
        // Apply theme immediately
        if (mode === 'system') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setTheme(isDark ? 'dark' : 'light');
        } else {
            setTheme(mode);
        }
    };

    return (
        <div className="space-y-6">
            <GlassCard className="p-6">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Appearance</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <button 
                        onClick={() => handleThemeChange('light')}
                        className={`flex items-center justify-center space-x-2 p-3 rounded-xl border transition-all ${themeMode === 'light' ? 'bg-cyan-500/10 border-cyan-500 text-cyan-600 dark:text-cyan-400' : 'bg-slate-50 dark:bg-slate-800/50 border-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                        <SunIcon className="w-5 h-5" />
                        <span>Light</span>
                    </button>
                    <button 
                         onClick={() => handleThemeChange('dark')}
                        className={`flex items-center justify-center space-x-2 p-3 rounded-xl border transition-all ${themeMode === 'dark' ? 'bg-cyan-500/10 border-cyan-500 text-cyan-600 dark:text-cyan-400' : 'bg-slate-50 dark:bg-slate-800/50 border-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                        <MoonIcon className="w-5 h-5" />
                        <span>Dark</span>
                    </button>
                    <button 
                         onClick={() => handleThemeChange('system')}
                        className={`flex items-center justify-center space-x-2 p-3 rounded-xl border transition-all ${themeMode === 'system' ? 'bg-cyan-500/10 border-cyan-500 text-cyan-600 dark:text-cyan-400' : 'bg-slate-50 dark:bg-slate-800/50 border-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                        <ComputerDesktopIcon className="w-5 h-5" />
                        <span>System</span>
                    </button>
                </div>

                <div className="flex items-center justify-between py-4 border-t border-slate-200 dark:border-slate-800">
                     <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Animation Effects</p>
                        <p className="text-xs text-slate-500">Enable transitions and glass motion effects</p>
                    </div>
                    <Switch
                        checked={animationEnabled}
                        onChange={(val) => updateSettings({ animationEnabled: val })}
                        className={`${animationEnabled ? 'bg-cyan-600' : 'bg-slate-200 dark:bg-slate-700'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none`}
                    >
                         <span className={`${animationEnabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                    </Switch>
                </div>

                <div className="flex items-center justify-between py-4 border-t border-slate-200 dark:border-slate-800">
                     <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Compact Density</p>
                        <p className="text-xs text-slate-500">Reduce spacing for denser data display</p>
                    </div>
                    <Switch
                        checked={density === 'compact'}
                        onChange={(val) => updateSettings({ density: val ? 'compact' : 'comfortable' })}
                        className={`${density === 'compact' ? 'bg-cyan-600' : 'bg-slate-200 dark:bg-slate-700'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none`}
                    >
                         <span className={`${density === 'compact' ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                    </Switch>
                </div>
            </GlassCard>

            <GlassCard className="p-6">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">System</h3>
                
                <div className="flex items-center justify-between py-2">
                    <div>
                         <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Auto-Refresh Interval</p>
                         <p className="text-xs text-slate-500">How often to fetch new data</p>
                    </div>
                    <div className="w-48">
                        <Listbox value={refreshInterval} onChange={(val) => updateSettings({ refreshInterval: val })}>
                            <div className="relative mt-1">
                                <Listbox.Button className="relative w-full cursor-default rounded-lg bg-slate-100 dark:bg-slate-800 py-2 pl-3 pr-10 text-left sm:text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500">
                                    <span className="block truncate text-slate-900 dark:text-slate-100">{REFRESH_OPTIONS.find(o => o.value === refreshInterval)?.name || 'Custom'}</span>
                                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                        <ChevronUpDownIcon className="h-5 w-5 text-slate-400" aria-hidden="true" />
                                    </span>
                                </Listbox.Button>
                                <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
                                    <Listbox.Options className="absolute right-0 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-slate-800 py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm z-50">
                                        {REFRESH_OPTIONS.map((opt) => (
                                            <Listbox.Option
                                                key={opt.value}
                                                className={({ active }) => `relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-900 dark:text-cyan-100' : 'text-slate-900 dark:text-slate-100'}`}
                                                value={opt.value}
                                            >
                                                {({ selected }) => (
                                                    <>
                                                        <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>{opt.name}</span>
                                                        {selected ? (
                                                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-cyan-600 dark:text-cyan-400">
                                                                <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                                            </span>
                                                        ) : null}
                                                    </>
                                                )}
                                            </Listbox.Option>
                                        ))}
                                    </Listbox.Options>
                                </Transition>
                            </div>
                        </Listbox>
                    </div>
                </div>

                 <div className="flex items-center justify-between py-4 border-t border-slate-200 dark:border-slate-800 mt-4">
                     <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Show Timestamps</p>
                        <p className="text-xs text-slate-500">Display last updated timestamps on dashboards</p>
                    </div>
                    <Switch
                        checked={showTimestamps}
                        onChange={(val) => updateSettings({ showTimestamps: val })}
                        className={`${showTimestamps ? 'bg-cyan-600' : 'bg-slate-200 dark:bg-slate-700'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none`}
                    >
                         <span className={`${showTimestamps ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                    </Switch>
                </div>
            </GlassCard>
        </div>
    );
};
