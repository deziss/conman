import React, { Fragment, useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Switch, Listbox, Transition } from '@headlessui/react';
import { 
    ShieldCheckIcon, 
    InformationCircleIcon, 
    CheckIcon, 
    ChevronUpDownIcon, 
    CpuChipIcon,
    ServerIcon,
    TrashIcon,
    ArrowPathIcon
} from '@heroicons/react/24/outline';
import { useSettings } from '../../contexts/SettingsContext';
import { ConfirmModal } from '../ui/ConfirmModal';
import api from '../../services/api';
import { toast } from 'react-hot-toast';

const SEVERITY_OPTIONS = [
    { name: 'All Severities (Full Audit)', value: 'ALL' },
    { name: 'Low and Above', value: 'LOW' },
    { name: 'Medium and Above', value: 'MEDIUM' },
    { name: 'High and Critical Only', value: 'HIGH' },
    { name: 'Critical Only', value: 'CRITICAL' },
];

interface TrivyStatus {
    installed: boolean;
    running: boolean;
    container_id?: string;
    status: string;
    cache_size: string;
}

export const SecuritySettings: React.FC = () => {
    const settingsContext = useSettings();
    const updateSettings = settingsContext.updateSettings;
    const trivySecurityEnabled = !!settingsContext.trivySecurityEnabled;
    const trivySeverityThreshold = settingsContext.trivySeverityThreshold || 'ALL';

    const [trivyStatus, setTrivyStatus] = useState<TrivyStatus>({
        installed: false,
        running: false,
        status: 'not_found',
        cache_size: '1.3G',
    });
    const [loadingStatus, setLoadingStatus] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [isPruneModalOpen, setIsPruneModalOpen] = useState(false);

    const fetchTrivyStatus = async () => {
        setLoadingStatus(true);
        try {
            const { data } = await api.get('/scanner/trivy/status');
            setTrivyStatus(data);
        } catch (err) {
            console.error('Failed to get Trivy status', err);
        } finally {
            setLoadingStatus(false);
        }
    };

    useEffect(() => {
        fetchTrivyStatus();
    }, []);

    const handleToggle = async (enabled: boolean) => {
        setToggling(true);
        try {
            updateSettings({ trivySecurityEnabled: enabled });
            if (enabled) {
                toast.loading('Starting conman-trivy container...', { id: 'trivy-toggle' });
                await api.post('/scanner/trivy/start');
                toast.success('Trivy container started & live scanning enabled', { id: 'trivy-toggle' });
            } else {
                toast.loading('Stopping conman-trivy container...', { id: 'trivy-toggle' });
                await api.post('/scanner/trivy/stop');
                toast.success('Trivy stopped. Host resources released.', { id: 'trivy-toggle' });
            }
            fetchTrivyStatus();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to update Trivy container state', { id: 'trivy-toggle' });
        } finally {
            setToggling(false);
        }
    };

    const handlePruneCache = async () => {
        try {
            await api.post('/scanner/trivy/prune-cache');
            toast.success('Vulnerability cache purged');
            fetchTrivyStatus();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to prune cache');
        } finally {
            setIsPruneModalOpen(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Primary Toggle Card */}
            <GlassCard className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start space-x-3">
                        <div className={`p-2.5 rounded-xl shrink-0 ${trivySecurityEnabled ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-500/10 text-slate-400'}`}>
                            <ShieldCheckIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center space-x-2">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                                    Trivy Security Vulnerability Scanner
                                </h3>
                                <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                                    trivySecurityEnabled 
                                        ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20' 
                                        : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                }`}>
                                    {trivySecurityEnabled ? 'Active' : 'Disabled (Default)'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
                                Inspect container images against the Aqua Security Trivy vulnerability database (CVEs, OS packages, application dependencies, and known exploits).
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center space-x-3 shrink-0 self-end sm:self-center">
                        <Switch
                            checked={trivySecurityEnabled}
                            onChange={handleToggle}
                            disabled={toggling}
                            className={`${
                                trivySecurityEnabled ? 'bg-cyan-600' : 'bg-slate-300 dark:bg-slate-700'
                            } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none`}
                        >
                            <span
                                className={`${
                                    trivySecurityEnabled ? 'translate-x-6' : 'translate-x-1'
                                } inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-md`}
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
                            <p className="font-medium">Live Managed Trivy Stack Active</p>
                            <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                                Conman manages the <code className="font-mono text-cyan-400">conman-trivy</code> container in warm server mode. Scans execute directly with zero container spin-up delay.
                            </p>
                        </div>
                    </div>
                )}
            </GlassCard>

            {/* Container Stack & Cache Metrics Card */}
            <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-white/10">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <ServerIcon className="w-5 h-5 text-cyan-500" />
                        Trivy Managed Container & Volume Storage
                    </h3>
                    <button
                        onClick={fetchTrivyStatus}
                        disabled={loadingStatus}
                        className="p-1.5 text-slate-400 hover:text-cyan-500 rounded-lg transition-colors"
                        title="Refresh Status"
                    >
                        <ArrowPathIcon className={`w-4 h-4 ${loadingStatus ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5">
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Container State</p>
                        <div className="flex items-center gap-2 mt-1.5">
                            <div className={`w-2.5 h-2.5 rounded-full ${trivyStatus.running ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-slate-400'}`} />
                            <span className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200">
                                {trivyStatus.running ? 'conman-trivy (Running)' : 'Stopped'}
                            </span>
                        </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5">
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Database Cache Volume</p>
                        <p className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200 mt-1.5">
                            {trivyStatus.cache_size} <span className="text-xs font-normal text-slate-400">(conman-trivy-cache)</span>
                        </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5 flex flex-col justify-between">
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Disk Cache Maintenance</p>
                        <button
                            onClick={() => setIsPruneModalOpen(true)}
                            className="mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-lg border border-rose-200 dark:border-rose-500/20 transition-colors"
                        >
                            <TrashIcon className="w-3.5 h-3.5" />
                            <span>Purge Cache (~1.3 GB)</span>
                        </button>
                    </div>
                </div>
            </GlassCard>

            {/* Scan Configuration & Preferences */}
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
                            <p className="text-xs text-slate-500">Aqua Security Trivy (Managed Container: conman-trivy)</p>
                        </div>
                        <span className="px-2.5 py-1 text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md border border-slate-200 dark:border-slate-700">
                            aquasec/trivy:latest
                        </span>
                    </div>
                </div>
            </GlassCard>

            <ConfirmModal
                isOpen={isPruneModalOpen}
                onClose={() => setIsPruneModalOpen(false)}
                onConfirm={handlePruneCache}
                title="Purge Vulnerability Cache"
                message="This will delete the 'conman-trivy-cache' volume to free up ~1.3 GB of disk space. Trivy will re-download updated feeds on the next scan."
                confirmText="Purge Cache"
                isDestructive={true}
            />
        </div>
    );
};
