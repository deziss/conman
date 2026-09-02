import React, { useState, useEffect, useRef } from 'react';
import { useTask, BackgroundTask, TaskType } from '../../contexts/TaskContext';
import { 
    ArrowDownTrayIcon, 
    TrashIcon, 
    ArrowPathIcon, 
    StopIcon, 
    PlayIcon, 
    PlusCircleIcon, 
    RocketLaunchIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    XMarkIcon,
    ClipboardDocumentIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    CommandLineIcon
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import clsx from 'clsx';

const getTaskIcon = (type: TaskType, status: string) => {
    if (status === 'success') return <CheckCircleIcon className="w-5 h-5 text-emerald-500" />;
    if (status === 'error') return <ExclamationCircleIcon className="w-5 h-5 text-rose-500" />;

    switch (type) {
        case 'pull':
            return <ArrowDownTrayIcon className="w-5 h-5 text-cyan-500 animate-bounce" />;
        case 'stop':
            return <StopIcon className="w-5 h-5 text-amber-500 animate-pulse" />;
        case 'start':
        case 'restart':
            return <ArrowPathIcon className="w-5 h-5 text-emerald-500 animate-spin" />;
        case 'remove':
        case 'prune':
            return <TrashIcon className="w-5 h-5 text-rose-500 animate-pulse" />;
        case 'create':
            return <PlusCircleIcon className="w-5 h-5 text-indigo-500 animate-pulse" />;
        case 'deploy':
            return <RocketLaunchIcon className="w-5 h-5 text-purple-500 animate-pulse" />;
        default:
            return <ArrowPathIcon className="w-5 h-5 text-cyan-500 animate-spin" />;
    }
};

const TaskCard = ({ task }: { task: BackgroundTask }) => {
    const { removeTask, toggleTaskExpand } = useTask();
    const [elapsed, setElapsed] = useState('0.0s');
    const logContainerRef = useRef<HTMLDivElement>(null);

    // Live elapsed timer
    useEffect(() => {
        if (task.status !== 'running') {
            const duration = ((task.endTime || Date.now()) - task.startTime) / 1000;
            setElapsed(`${duration.toFixed(1)}s`);
            return;
        }

        const timer = setInterval(() => {
            const sec = (Date.now() - task.startTime) / 1000;
            setElapsed(`${sec.toFixed(1)}s`);
        }, 100);

        return () => clearInterval(timer);
    }, [task.status, task.startTime, task.endTime]);

    // Auto-scroll log box on new messages
    useEffect(() => {
        if (task.isExpanded && logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [task.logs.length, task.isExpanded]);

    const handleCopyLogs = (e: React.MouseEvent) => {
        e.stopPropagation();
        const text = task.logs.map(l => `[${l.timestamp}] [${l.level?.toUpperCase() || 'INFO'}] ${l.message}`).join('\n');
        navigator.clipboard.writeText(text);
        toast.success('Task logs copied');
    };

    const isRunning = task.status === 'running';
    const isSuccess = task.status === 'success';
    const isError = task.status === 'error';

    return (
        <div className={clsx(
            "rounded-2xl border backdrop-blur-xl shadow-xl transition-all duration-300 overflow-hidden bg-white/95 dark:bg-slate-900/95",
            isRunning && "border-cyan-500/40 shadow-cyan-500/10",
            isSuccess && "border-emerald-500/40 bg-emerald-50/10 dark:bg-emerald-950/20",
            isError && "border-rose-500/40 bg-rose-50/10 dark:bg-rose-950/20"
        )}>
            {/* Main Header Row */}
            <div className="p-3.5 flex items-start justify-between gap-3">
                <div className="flex items-start space-x-3 min-w-0 flex-1">
                    {/* Icon container */}
                    <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 flex-shrink-0 mt-0.5">
                        {getTaskIcon(task.type, task.status)}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {task.title}
                            </h4>
                            <span className={clsx(
                                "text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-full",
                                isRunning && "bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 animate-pulse",
                                isSuccess && "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
                                isError && "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                            )}>
                                {isRunning ? 'Running' : isSuccess ? 'Completed' : 'Failed'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono ml-auto flex-shrink-0">
                                {elapsed}
                            </span>
                        </div>

                        {task.resource && (
                            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5" title={task.resource}>
                                {task.resource}
                            </p>
                        )}

                        {/* Latest Log Preview */}
                        {task.logs.length > 0 && !task.isExpanded && (
                            <p className="text-[10px] font-mono text-slate-600 dark:text-slate-400 truncate mt-1 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                                <span className="truncate">{task.logs[task.logs.length - 1].message}</span>
                            </p>
                        )}
                    </div>
                </div>

                {/* Right controls */}
                <div className="flex items-center space-x-1 flex-shrink-0">
                    <button
                        onClick={() => toggleTaskExpand(task.id)}
                        className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                        title={task.isExpanded ? "Collapse logs" : "View task logs"}
                    >
                        {task.isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={() => removeTask(task.id)}
                        className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors"
                        title="Dismiss"
                    >
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Progress / Countdown Bar */}
            <div className="px-3.5 pb-2">
                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                    {isRunning ? (
                        typeof task.progress === 'number' ? (
                            <div 
                                className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-300 rounded-full"
                                style={{ width: `${task.progress}%` }}
                            />
                        ) : (
                            <div 
                                className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-cyan-500 rounded-full animate-shimmer"
                                style={{ width: '65%' }}
                            />
                        )
                    ) : isSuccess ? (
                        <div 
                            className="h-full bg-emerald-500 transition-all duration-1000 rounded-full"
                            style={{ width: `${(task.autoRemoveCountdown || 0) * 16.6}%` }}
                        />
                    ) : (
                        <div className="h-full bg-rose-500 rounded-full w-full" />
                    )}
                </div>

                {isSuccess && task.autoRemoveCountdown !== undefined && (
                    <div className="flex justify-between items-center mt-1">
                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">Task succeeded</span>
                        <span className="text-[9px] text-slate-400 font-mono">Fading in {task.autoRemoveCountdown}s</span>
                    </div>
                )}
            </div>

            {/* Expandable Mini Log Terminal */}
            {task.isExpanded && (
                <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-950 p-3 text-xs font-mono">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-2">
                        <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                            <CommandLineIcon className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Execution Log Feed ({task.logs.length} events)</span>
                        </div>
                        <button
                            onClick={handleCopyLogs}
                            className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-cyan-300 transition-colors bg-slate-900 px-2 py-0.5 rounded border border-slate-800"
                        >
                            <ClipboardDocumentIcon className="w-3 h-3" />
                            <span>Copy</span>
                        </button>
                    </div>

                    <div 
                        ref={logContainerRef} 
                        className="max-h-40 overflow-y-auto space-y-1 pr-1 font-mono text-[11px] select-text"
                    >
                        {task.logs.map((log, idx) => (
                            <div key={idx} className="leading-tight flex items-start gap-2">
                                <span className="text-slate-500 text-[10px] flex-shrink-0 select-none">
                                    {log.timestamp}
                                </span>
                                <span className={clsx(
                                    "flex-1 break-all",
                                    log.level === 'error' && "text-rose-400 font-medium",
                                    log.level === 'warn' && "text-amber-400",
                                    log.level === 'success' && "text-emerald-400 font-medium",
                                    (!log.level || log.level === 'info') && "text-slate-300"
                                )}>
                                    {log.message}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export const TaskToastDrawer = () => {
    const { tasks, clearCompletedTasks } = useTask();
    const [isMinimized, setIsMinimized] = useState(false);

    if (tasks.length === 0) return null;

    const runningCount = tasks.filter(t => t.status === 'running').length;
    const completedCount = tasks.filter(t => t.status !== 'running').length;

    return (
        <aside 
            aria-label="Background Tasks and Operations"
            className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm sm:max-w-md w-full animate-fade-in pointer-events-auto"
        >
            {/* Header / Drawer Bar */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-900/90 text-white backdrop-blur-xl border border-slate-700/60 shadow-2xl">
                <div className="flex items-center space-x-2.5">
                    {runningCount > 0 ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                    ) : (
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    )}
                    <span className="text-xs font-semibold">
                        Background Operations ({runningCount} active)
                    </span>
                </div>

                <div className="flex items-center space-x-2">
                    {completedCount > 0 && (
                        <button
                            onClick={clearCompletedTasks}
                            className="text-[10px] font-medium text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700 transition-colors"
                        >
                            Clear Done
                        </button>
                    )}
                    <button
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="p-1 rounded text-slate-400 hover:text-white transition-colors"
                        title={isMinimized ? "Expand task drawer" : "Minimize task drawer"}
                    >
                        {isMinimized ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Task List (Parallel Toasts) */}
            {!isMinimized && (
                <div className="flex flex-col gap-2.5 max-h-[70vh] overflow-y-auto pr-1">
                    {tasks.map(task => (
                        <TaskCard key={task.id} task={task} />
                    ))}
                </div>
            )}
        </aside>
    );
};

export default TaskToastDrawer;
