import React from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { GlassCard } from '../ui/GlassCard';
import { Switch, Listbox, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import {
    ShieldCheckIcon,
    InformationCircleIcon,
    CheckIcon,
    ChevronUpDownIcon,
    CpuChipIcon,
    CircleStackIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const SEVERITY_OPTIONS = [
    { value: 'ALL', name: 'All Severities (Full Audit)' },
    { value: 'LOW', name: 'Low and Above' },
    { value: 'MEDIUM', name: 'Medium and Above' },
    { value: 'HIGH', name: 'High & Critical Only' },
    { value: 'CRITICAL', name: 'Critical Only' }
];

export const SecuritySettings: React.FC = () => {
    const { trivySecurityEnabled, trivySeverityThreshold, updateSettings } = useSettings();

    const handleToggleTrivy = (enabled: boolean) => {
        updateSettings({ trivySecurityEnabled: enabled });
        if (enabled) {
            toast.success('Trivy Image Vulnerability Scanning Enabled');
        } else {
            toast('Trivy Scanning Disabled (Resource Saver Mode)', { icon: '🛡️' });
        }
    };

    return (
        <div className="space-y-6">
            {/* Primary Toggle Card */}
            <GlassCard className="p-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start space-x-3.5">
                        <div className={`p-3 rounded-2xl shrink-0 transition-colors ${
                            trivySecurityEnabled 
                                ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 ring-1 ring-cyan-500/20' 
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                        }`}>
                            <ShieldCheckIcon className="w-7 h-7" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                                    Trivy Security Vulnerability Scanner
                                </h3>
                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
                                    trivySecurityEnabled
                                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                                }`}>
                                    {trivySecurityEnabled ? 'Active' : 'Disabled (Default)'}
                                </span>
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                                Inspect container images against the Aqua Security Trivy vulnerability database (CVEs, OS packages, application dependencies, and known exploits).
                            </p>
                        </div>
                    </div>

                    <div className="shrink-0 pt-1">
                        <Switch
                            checked={trivySecurityEnabled}
                            onChange={handleToggleTrivy}
                            className={`${
                                trivySecurityEnabled ? 'bg-cyan-600' : 'bg-slate-200 dark:bg-slate-700'
                            } relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2`}
                        >
                            <span
                                className={`${
                                    trivySecurityEnabled ? 'translate-x-6' : 'translate-x-1'
                                } inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-md`}
                            />
                        </Switch>
                    </div>
                </div>

                {/* Status Notice */}
                {!trivySecurityEnabled ? (
                    <div className="mt-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 flex items-start space-x-3 text-xs text-slate-500 dark:text-slate-400">
                        <InformationCircleIcon className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium text-slate-700 dark:text-slate-300">Resource Saver Mode is Active</p>
                            <p className="mt-0.5">
                                Trivy scanning is turned off by default to minimize memory consumption and network overhead on small VPS and local dev hosts. Container spec inspection remains fully operational.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="mt-6 p-4 rounded-xl bg-cyan-500/[0.04] border border-cyan-500/20 flex items-start space-x-3 text-xs text-cyan-800 dark:text-cyan-300">
                        <ShieldCheckIcon className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium">Live Vulnerability Scanning Enabled</p>
                            <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                                Image details pages will now allow on-demand deep vulnerability scanning and display comprehensive CVE audit summaries.
                            </p>
                        </div>
                    </div>
                )}
            </GlassCard>

            {/* Additional Security Preferences */}
            <GlassCard className={`p-6 transition-opacity duration-300 ${!trivySecurityEnabled ? 'opacity-60 pointer-events-none' : ''}`}>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <CpuChipIcon className="w-5 h-5 text-indigo-500" />
                    Scan Configuration & Preferences
                </h3>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    <div className="flex items-center justify-between py-3.5">
                        <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Default Severity Filter</p>
                            <p className="text-xs text-slate-500">Filter image vulnerability cards by severity grade</p>
                        </div>
                        <div className="w-56">
                            <Listbox 
                                value={trivySeverityThreshold || 'ALL'} 
                                onChange={(val: any) => updateSettings({ trivySeverityThreshold: val })}
                            >
                                <div className="relative">
                                    <Listbox.Button className="relative w-full cursor-default rounded-lg bg-slate-100 dark:bg-slate-800 py-2 pl-3 pr-8 text-left text-xs font-medium focus:outline-none focus:ring-1 focus:ring-cyan-500">
                                        <span className="block truncate text-slate-800 dark:text-slate-200">
                                            {SEVERITY_OPTIONS.find(o => o.value === (trivySeverityThreshold || 'ALL'))?.name}
                                        </span>
                                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                            <ChevronUpDownIcon className="h-4 w-4 text-slate-400" />
                                        </span>
                                    </Listbox.Button>
                                    <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
                                        <Listbox.Options className="absolute right-0 mt-1 max-h-60 w-full overflow-auto rounded-xl bg-white dark:bg-slate-800 py-1 text-xs shadow-xl ring-1 ring-black/5 focus:outline-none z-50">
                                            {SEVERITY_OPTIONS.map((opt) => (
                                                <Listbox.Option
                                                    key={opt.value}
                                                    className={({ active }) => `relative cursor-default select-none py-2 pl-8 pr-3 ${
                                                        active ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' : 'text-slate-700 dark:text-slate-300'
                                                    }`}
                                                    value={opt.value}
                                                >
                                                    {({ selected }) => (
                                                        <>
                                                            <span className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}>
                                                                {opt.name}
                                                            </span>
                                                            {selected && (
                                                                <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-cyan-500">
                                                                    <CheckIcon className="h-4 w-4" />
                                                                </span>
                                                            )}
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

                    <div className="py-3.5 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Engine Provider</p>
                            <p className="text-xs text-slate-500">Aqua Security Trivy (Docker Engine Container or Native Host CLI)</p>
                        </div>
                        <span className="px-2.5 py-1 text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md border border-slate-200 dark:border-slate-700">
                            aquasec/trivy:latest
                        </span>
                    </div>

                    <div className="py-3.5 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Vulnerability Database Cache</p>
                            <p className="text-xs text-slate-500">Volume-backed persistent CVE database (/root/.cache)</p>
                        </div>
                        <span className="px-2.5 py-1 text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md border border-slate-200 dark:border-slate-700">
                            conman-trivy-cache
                        </span>
                    </div>
                </div>
            </GlassCard>
        </div>
    );
};
