import React, { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { 
    XMarkIcon, 
    LifebuoyIcon, 
    ClipboardDocumentCheckIcon, 
    ClipboardDocumentIcon,
    ArrowTopRightOnSquareIcon,
    ServerStackIcon
} from '@heroicons/react/24/outline';
import { APP_CONFIG } from '../../constants/app';
import { useHost } from '../../contexts/HostContext';
import { useLicense } from '../../contexts/LicenseContext';
import { toast } from 'react-hot-toast';

interface SupportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
    const { currentHost, hosts } = useHost();
    const { license } = useLicense();
    const [copied, setCopied] = useState(false);

    const diagnostics = {
        app_version: APP_CONFIG.VERSION,
        build: APP_CONFIG.BUILD,
        license_tier: license?.tier || 'community',
        current_host: currentHost?.name || 'Local Host',
        current_host_id: currentHost?.id || 'default',
        host_count: hosts.length,
        docker_version: currentHost?.host_info?.docker_version || 'Docker 27+',
        os: currentHost?.host_info?.os || navigator.platform,
        browser: navigator.userAgent,
        timestamp: new Date().toISOString(),
    };

    const handleCopyDiagnostics = () => {
        const text = '```json\n' + JSON.stringify(diagnostics, null, 2) + '\n```';
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success('System diagnostics copied to clipboard!');
        setTimeout(() => setCopied(false), 3000);
    };

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-200"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-150"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-200"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-150"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-xl transform overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 shadow-2xl transition-all">
                                <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                                            <LifebuoyIcon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <Dialog.Title as="h3" className="text-base font-semibold text-slate-900 dark:text-white">
                                                Support & System Diagnostics
                                            </Dialog.Title>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                Get help, report issues, and view environment telemetry
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={onClose}
                                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
                                    >
                                        <XMarkIcon className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Quick Links */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-4">
                                    <a
                                        href={APP_CONFIG.SUPPORT_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-white/5 transition-all group"
                                    >
                                        <div>
                                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">GitHub Issue Tracker</p>
                                            <p className="text-[11px] text-slate-500">Report a bug or crash</p>
                                        </div>
                                        <ArrowTopRightOnSquareIcon className="w-4 h-4 text-slate-400 group-hover:text-purple-500 transition-colors" />
                                    </a>

                                    <a
                                        href={APP_CONFIG.COMMUNITY_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-white/5 transition-all group"
                                    >
                                        <div>
                                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Community Discussions</p>
                                            <p className="text-[11px] text-slate-500">Ask questions & share ideas</p>
                                        </div>
                                        <ArrowTopRightOnSquareIcon className="w-4 h-4 text-slate-400 group-hover:text-purple-500 transition-colors" />
                                    </a>
                                </div>

                                {/* System Diagnostics Box */}
                                <div className="space-y-2 mt-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            <ServerStackIcon className="w-4 h-4 text-cyan-500" />
                                            <span>Telemetry Diagnostics</span>
                                        </div>
                                        <button
                                            onClick={handleCopyDiagnostics}
                                            className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-600 dark:text-purple-400 hover:underline"
                                        >
                                            {copied ? (
                                                <>
                                                    <ClipboardDocumentCheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                                                    <span className="text-emerald-500 font-semibold">Copied!</span>
                                                </>
                                            ) : (
                                                <>
                                                    <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                                    <span>Copy for Bug Report</span>
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    <div className="bg-slate-950 rounded-xl p-3 text-[11px] font-mono text-slate-300 border border-slate-800 max-h-48 overflow-y-auto space-y-1">
                                        <p><span className="text-cyan-400">App Version:</span> {diagnostics.app_version} ({diagnostics.build})</p>
                                        <p><span className="text-cyan-400">License Tier:</span> {diagnostics.license_tier}</p>
                                        <p><span className="text-cyan-400">Host Node:</span> {diagnostics.current_host} ({diagnostics.current_host_id})</p>
                                        <p><span className="text-cyan-400">Docker Runtime:</span> {diagnostics.docker_version}</p>
                                        <p><span className="text-cyan-400">OS / Platform:</span> {diagnostics.os}</p>
                                        <p><span className="text-cyan-400">Total Hosts:</span> {diagnostics.host_count}</p>
                                    </div>
                                    <p className="text-[11px] text-slate-400">
                                        Attaching these diagnostics helps the engineering team triage host issues faster.
                                    </p>
                                </div>

                                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-white/10 flex justify-end gap-2">
                                    <button
                                        onClick={onClose}
                                        className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                                    >
                                        Close
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};
