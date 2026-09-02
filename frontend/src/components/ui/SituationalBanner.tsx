import { 
    ArrowDownTrayIcon, 
    TrashIcon, 
    ArrowPathIcon,
    CpuChipIcon,
    SparklesIcon
} from '@heroicons/react/24/outline';
import clsx from 'clsx';

export type ActionType = 'pruning' | 'pulling' | 'deleting' | 'updating' | 'restarting' | 'generic';

interface SituationalBannerProps {
    action: ActionType;
    title: string;
    description?: string;
    isVisible: boolean;
}

const actionConfig: Record<ActionType, {
    icon: any;
    color: string;
    bg: string;
    border: string;
    spin?: boolean;
}> = {
    pruning: {
        icon: TrashIcon,
        color: 'text-amber-500',
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        border: 'border-amber-200 dark:border-amber-800/60',
    },
    pulling: {
        icon: ArrowDownTrayIcon,
        color: 'text-cyan-500',
        bg: 'bg-cyan-50 dark:bg-cyan-950/40',
        border: 'border-cyan-200 dark:border-cyan-800/60',
    },
    deleting: {
        icon: TrashIcon,
        color: 'text-rose-500',
        bg: 'bg-rose-50 dark:bg-rose-950/40',
        border: 'border-rose-200 dark:border-rose-800/60',
    },
    updating: {
        icon: SparklesIcon,
        color: 'text-indigo-500',
        bg: 'bg-indigo-50 dark:bg-indigo-950/40',
        border: 'border-indigo-200 dark:border-indigo-800/60',
    },
    restarting: {
        icon: ArrowPathIcon,
        color: 'text-emerald-500',
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        border: 'border-emerald-200 dark:border-emerald-800/60',
        spin: true,
    },
    generic: {
        icon: CpuChipIcon,
        color: 'text-cyan-500',
        bg: 'bg-cyan-50 dark:bg-cyan-950/40',
        border: 'border-cyan-200 dark:border-cyan-800/60',
    }
};

export const SituationalBanner = ({
    action,
    title,
    description,
    isVisible
}: SituationalBannerProps) => {
    if (!isVisible) return null;

    const config = actionConfig[action] || actionConfig.generic;
    const Icon = config.icon;

    return (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce-short max-w-md w-full shadow-2xl">
            <div className={clsx(
                "rounded-2xl border p-4 backdrop-blur-xl shadow-lg transition-all flex items-start space-x-3.5",
                config.bg,
                config.border
            )}>
                {/* Icon with Spinning Ring */}
                <div className="relative flex-shrink-0 mt-0.5">
                    <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center shadow-sm">
                        <Icon className={clsx("w-5 h-5", config.color, config.spin && "animate-spin")} />
                    </div>
                    <div className="absolute -inset-0.5 rounded-xl border border-cyan-500/40 animate-ping opacity-30" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {title}
                        </h4>
                        <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-cyan-500 animate-spin" />
                    </div>
                    {description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                            {description}
                        </p>
                    )}
                    <div className="mt-2.5 h-1 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500 rounded-full animate-shimmer" style={{ width: '70%' }} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SituationalBanner;
