import React, { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { 
    XMarkIcon, 
    SparklesIcon, 
    ArrowTopRightOnSquareIcon,
    ShieldCheckIcon,
    ServerStackIcon,
    BellAlertIcon,
    Squares2X2Icon
} from '@heroicons/react/24/outline';
import { APP_CONFIG } from '../../constants/app';

interface UpdatesModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const UpdatesModal: React.FC<UpdatesModalProps> = ({ isOpen, onClose }) => {
    const releases = [
        {
            version: 'v1.2.2',
            date: 'September 2026',
            badge: 'Current Version',
            features: [
                {
                    icon: ShieldCheckIcon,
                    title: 'Type Checking Actually Enforced',
                    desc: 'The build and CI now run a type check that reads the project, clearing 132 previously invisible errors and stopping broken code from reaching main.'
                },
                {
                    icon: Squares2X2Icon,
                    title: 'Container Detail Tabs Fixed',
                    desc: 'The Processes and Activity tabs are now part of the tab contract instead of drifting from it, and the container inspect dialog shows its heading.'
                },
                {
                    icon: ServerStackIcon,
                    title: 'Stack Port Details',
                    desc: 'Published stack ports now carry their target port and protocol through to the UI, matching what the server already sends.'
                }
            ]
        },
        {
            version: 'v1.2.1',
            date: 'September 2026',
            badge: 'Previous Release',
            features: [
                {
                    icon: SparklesIcon,
                    title: 'Working Frontend CI',
                    desc: 'The dashboard lockfile is now tracked, so the frontend install, type check, and unit test job actually runs on every push instead of failing before it starts.'
                }
            ]
        },
        {
            version: 'v1.2.0',
            date: 'September 2026',
            badge: 'Previous Release',
            features: [
                {
                    icon: ShieldCheckIcon,
                    title: 'Hardened Authorization & Secrets',
                    desc: 'RBAC enforced on every multi-host route, HMAC-signed deploy webhooks, enforced API key expiry, and a server that refuses to boot on placeholder secrets.'
                },
                {
                    icon: ServerStackIcon,
                    title: 'Podman & containerd Runtimes',
                    desc: 'Agents auto-detect Docker, Podman, or containerd at startup, with rootless Podman and namespace-aware containerd support.'
                },
                {
                    icon: Squares2X2Icon,
                    title: 'Sortable Full-Width Inventory',
                    desc: 'Containers and Images pages use the full viewport with sortable columns and sticky Name/Actions while the table scrolls.'
                },
                {
                    icon: SparklesIcon,
                    title: 'Continuous Integration',
                    desc: 'GitHub Actions runs backend, agent, and frontend checks on every push and pull request to main.'
                }
            ]
        },
        {
            version: 'v1.1.0',
            date: 'September 2026',
            badge: 'Previous Release',
            features: [
                {
                    icon: ShieldCheckIcon,
                    title: 'Aqua Security Trivy Scanner',
                    desc: 'On-demand and automated vulnerability auditing with CVE breakdown, severity filtering, and managed container lifecycle.'
                },
                {
                    icon: BellAlertIcon,
                    title: 'Standard Alerts & Notification Channels',
                    desc: 'Monitor agent heartbeats, container crashes, and system state with Slack, Discord, and Com0 multi-channel webhook dispatching.'
                },
                {
                    icon: ServerStackIcon,
                    title: 'Multi-Node Fleet Architecture',
                    desc: 'Deploy lightweight Go host agents with hybrid scrape/pull and reverse connection capabilities for edge nodes.'
                },
                {
                    icon: Squares2X2Icon,
                    title: 'Compose V2 Stack Orchestration',
                    desc: 'Deploy, rollback, update, and manage multi-container Docker Compose stacks with environment variable isolation.'
                }
            ]
        },
        {
            version: 'v1.0.1',
            date: 'August 2026',
            badge: 'Initial GA',
            features: [
                {
                    icon: SparklesIcon,
                    title: 'Unified Server & Web UI',
                    desc: 'High-performance Go Chi REST engine with integrated Vite React SPA and real-time WebSocket metrics streaming.'
                }
            ]
        }
    ];

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
                                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                                            <SparklesIcon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <Dialog.Title as="h3" className="text-base font-semibold text-slate-900 dark:text-white">
                                                Conman Release Notes & Updates
                                            </Dialog.Title>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                Latest features, improvements, and system updates
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

                                <div className="my-4 space-y-6 max-h-[60vh] overflow-y-auto pr-1">
                                    {releases.map((rel, idx) => (
                                        <div key={idx} className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">{rel.version}</span>
                                                    <span className="text-xs text-slate-400">({rel.date})</span>
                                                </div>
                                                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                                                    {rel.badge}
                                                </span>
                                            </div>

                                            <div className="space-y-2">
                                                {rel.features.map((feat, fIdx) => {
                                                    const Icon = feat.icon;
                                                    return (
                                                        <div key={fIdx} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5">
                                                            <div className="p-1.5 rounded-lg bg-slate-200/60 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 shrink-0 mt-0.5">
                                                                <Icon className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{feat.title}</p>
                                                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">{feat.desc}</p>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between">
                                    <a
                                        href={APP_CONFIG.UPDATES_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs text-cyan-600 dark:text-cyan-400 hover:underline font-medium"
                                    >
                                        <span>View GitHub Releases</span>
                                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                                    </a>
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
