import React, { Fragment, useState } from 'react';
import { Dialog, Transition, Tab } from '@headlessui/react';
import { 
    XMarkIcon, 
    QuestionMarkCircleIcon, 
    CommandLineIcon, 
    BookOpenIcon, 
    WrenchScrewdriverIcon,
    ArrowTopRightOnSquareIcon
} from '@heroicons/react/24/outline';
import { APP_CONFIG } from '../../constants/app';

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
    const [selectedTab, setSelectedTab] = useState(0);

    const shortcuts = [
        { key: 'Ctrl + K / Cmd + K', action: 'Quick search containers & images' },
        { key: 'Esc', action: 'Close active modals and drawer panels' },
        { key: 'R', action: 'Refresh active resource table' },
        { key: 'L', action: 'Open real-time container log stream' },
        { key: 'T', action: 'Toggle light and dark theme mode' },
    ];

    const quickStart = [
        {
            title: 'Containers',
            desc: 'Start, stop, restart, pause, and inspect containers. View live CPU/memory charts and stream terminal logs.'
        },
        {
            title: 'Stacks (Compose V2)',
            desc: 'Deploy multi-service applications using docker-compose.yml and environment variables with auto-restart and rollback.'
        },
        {
            title: 'Images & Security',
            desc: 'Inspect layers, check for registry updates, delete untagged images, and run Aqua Security Trivy vulnerability audits.'
        },
        {
            title: 'Multi-Host Fleet',
            desc: 'Manage edge nodes and remote servers seamlessly using lightweight Conman Agent instances in hybrid pull/push mode.'
        },
    ];

    const troubleshooting = [
        {
            problem: 'Cannot connect to Docker Daemon',
            solution: 'Ensure /var/run/docker.sock is mounted into Conman and permissions allow read/write access (sudo usermod -aG docker $USER).'
        },
        {
            problem: 'Agent offline or disconnected',
            solution: 'Verify network connectivity between the Conman server and Agent port 5073, or check AGENT_TOKEN in your environment.'
        },
        {
            problem: 'Container port conflicts',
            solution: 'Use the Network view to check bound host ports and resolve conflicting container bindings before starting a stack.'
        },
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
                            <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 shadow-2xl transition-all">
                                <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500">
                                            <QuestionMarkCircleIcon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <Dialog.Title as="h3" className="text-base font-semibold text-slate-900 dark:text-white">
                                                Conman Help & Documentation
                                            </Dialog.Title>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                Guides, shortcuts, and troubleshooting tips
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

                                <Tab.Group selectedIndex={selectedTab} onChange={setSelectedTab}>
                                    <Tab.List className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl my-4">
                                        <Tab className={({ selected }) =>
                                            `flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                                selected
                                                    ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                            }`
                                        }>
                                            <BookOpenIcon className="w-3.5 h-3.5" /> Quick Start
                                        </Tab>
                                        <Tab className={({ selected }) =>
                                            `flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                                selected
                                                    ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                            }`
                                        }>
                                            <CommandLineIcon className="w-3.5 h-3.5" /> Shortcuts
                                        </Tab>
                                        <Tab className={({ selected }) =>
                                            `flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                                selected
                                                    ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                            }`
                                        }>
                                            <WrenchScrewdriverIcon className="w-3.5 h-3.5" /> Troubleshooting
                                        </Tab>
                                    </Tab.List>

                                    <Tab.Panels className="py-2">
                                        {/* Quick Start Panel */}
                                        <Tab.Panel className="space-y-3 focus:outline-none">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {quickStart.map((item, idx) => (
                                                    <div key={idx} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5">
                                                        <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                                                            {item.title}
                                                        </h4>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                                            {item.desc}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </Tab.Panel>

                                        {/* Shortcuts Panel */}
                                        <Tab.Panel className="space-y-2 focus:outline-none">
                                            {shortcuts.map((sc, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5">
                                                    <span className="text-xs text-slate-600 dark:text-slate-300">{sc.action}</span>
                                                    <kbd className="px-2.5 py-1 text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-700/80 rounded border border-slate-300 dark:border-slate-600">
                                                        {sc.key}
                                                    </kbd>
                                                </div>
                                            ))}
                                        </Tab.Panel>

                                        {/* Troubleshooting Panel */}
                                        <Tab.Panel className="space-y-3 focus:outline-none">
                                            {troubleshooting.map((item, idx) => (
                                                <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5">
                                                    <p className="text-xs font-semibold text-rose-500 dark:text-rose-400 mb-1">
                                                        {item.problem}
                                                    </p>
                                                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                                        {item.solution}
                                                    </p>
                                                </div>
                                            ))}
                                        </Tab.Panel>
                                    </Tab.Panels>
                                </Tab.Group>

                                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between">
                                    <a
                                        href={APP_CONFIG.DOCS_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs text-cyan-600 dark:text-cyan-400 hover:underline font-medium"
                                    >
                                        <span>Read Full Documentation</span>
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
