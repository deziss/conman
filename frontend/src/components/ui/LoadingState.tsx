import { 
    CubeIcon, 
    CircleStackIcon, 
    GlobeAltIcon, 
    BoltIcon, 
    RectangleStackIcon, 
    PhotoIcon,
    ArrowPathIcon
} from '@heroicons/react/24/outline';
import clsx from 'clsx';

export type LoadingCategory = 'images' | 'volumes' | 'containers' | 'networks' | 'stacks' | 'activities' | 'dashboard' | 'generic';

interface LoadingStateProps {
    type?: LoadingCategory;
    viewMode?: 'table' | 'grid';
    count?: number;
    title?: string;
    description?: string;
}

const configMap: Record<LoadingCategory, {
    title: string;
    description: string;
    icon: any;
    accentColor: string;
    bgAccent: string;
}> = {
    images: {
        title: 'Scanning Docker Images...',
        description: 'Querying repository tags, image layers, digest verification and virtual disk sizes.',
        icon: PhotoIcon,
        accentColor: 'text-amber-500',
        bgAccent: 'bg-amber-500/10 border-amber-500/20'
    },
    volumes: {
        title: 'Inspecting Docker Volumes...',
        description: 'Analyzing persistent storage drivers, mountpoints and calculating disk consumption.',
        icon: CircleStackIcon,
        accentColor: 'text-cyan-500',
        bgAccent: 'bg-cyan-500/10 border-cyan-500/20'
    },
    containers: {
        title: 'Discovering Containers...',
        description: 'Reading real-time container states, port bindings, IP allocations and resource utilization.',
        icon: CubeIcon,
        accentColor: 'text-emerald-500',
        bgAccent: 'bg-emerald-500/10 border-emerald-500/20'
    },
    networks: {
        title: 'Inspecting Network Topologies...',
        description: 'Mapping bridge drivers, subnet CIDRs, gateway interfaces and active container endpoints.',
        icon: GlobeAltIcon,
        accentColor: 'text-indigo-500',
        bgAccent: 'bg-indigo-500/10 border-indigo-500/20'
    },
    stacks: {
        title: 'Parsing Docker Stacks...',
        description: 'Analyzing multi-container compose definitions, dependencies and service configurations.',
        icon: RectangleStackIcon,
        accentColor: 'text-purple-500',
        bgAccent: 'bg-purple-500/10 border-purple-500/20'
    },
    activities: {
        title: 'Loading Activity Audit Ledger...',
        description: 'Parsing Docker system events, container lifecycle transitions and user operations.',
        icon: BoltIcon,
        accentColor: 'text-yellow-500',
        bgAccent: 'bg-yellow-500/10 border-yellow-500/20'
    },
    dashboard: {
        title: 'Aggregating Host Metrics...',
        description: 'Collecting CPU cores, memory limits, network throughput and host system status.',
        icon: ArrowPathIcon,
        accentColor: 'text-cyan-500',
        bgAccent: 'bg-cyan-500/10 border-cyan-500/20'
    },
    generic: {
        title: 'Communicating with Agent...',
        description: 'Performing remote Docker socket operations and syncing metadata...',
        icon: ArrowPathIcon,
        accentColor: 'text-cyan-500',
        bgAccent: 'bg-cyan-500/10 border-cyan-500/20'
    }
};

export const LoadingState = ({
    type = 'generic',
    viewMode = 'table',
    count = 6,
    title,
    description
}: LoadingStateProps) => {
    const config = configMap[type] || configMap.generic;
    const IconComponent = config.icon;
    const displayTitle = title || config.title;
    const displayDesc = description || config.description;

    return (
        <div className="space-y-6 w-full animate-fade-in py-2">
            {/* Situational Ambient Header Card */}
            <div className="relative overflow-hidden rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-6 backdrop-blur-md shadow-sm">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                    {/* Animated Icon with Multi-layer Glow */}
                    <div className="relative flex-shrink-0">
                        <div className={clsx("w-14 h-14 rounded-2xl flex items-center justify-center border", config.bgAccent)}>
                            <IconComponent className={clsx("w-7 h-7 animate-pulse", config.accentColor)} />
                        </div>
                        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 blur-md -z-10 animate-pulse" />
                    </div>

                    <div className="flex-1 text-center sm:text-left space-y-1">
                        <div className="flex items-center justify-center sm:justify-start gap-2.5">
                            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                {displayTitle}
                            </h3>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 animate-pulse">
                                Syncing Host
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
                            {displayDesc}
                        </p>

                        {/* Animated Progress Bar */}
                        <div className="pt-2">
                            <div className="h-1.5 w-full max-w-md bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                                <div className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-cyan-500 via-indigo-500 to-cyan-500 rounded-full w-2/5 animate-shimmer" 
                                     style={{ width: '60%' }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Skeleton Content: Table vs Grid */}
            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: count }).map((_, i) => (
                        <div 
                            key={i} 
                            className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/40 p-5 space-y-4 animate-shimmer"
                            style={{ animationDelay: `${i * 120}ms` }}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-800/80 animate-pulse" />
                                    <div className="space-y-1.5">
                                        <div className="w-32 h-4 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                                        <div className="w-20 h-3 rounded bg-slate-200/70 dark:bg-slate-800/60 animate-pulse" />
                                    </div>
                                </div>
                                <div className="w-16 h-5 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/40">
                                <div className="h-7 rounded-lg bg-slate-100 dark:bg-slate-800/50 animate-pulse" />
                                <div className="h-7 rounded-lg bg-slate-100 dark:bg-slate-800/50 animate-pulse" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 overflow-hidden shadow-sm animate-shimmer">
                    <div className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                        <div className="w-24 h-4 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                        <div className="w-36 h-4 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/40">
                        {Array.from({ length: count }).map((_, i) => (
                            <div 
                                key={i} 
                                className="px-6 py-4 flex items-center justify-between gap-4"
                                style={{ animationDelay: `${i * 80}ms` }}
                            >
                                <div className="flex items-center space-x-3.5 flex-1 min-w-0">
                                    <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800/80 animate-pulse flex-shrink-0" />
                                    <div className="space-y-1.5 flex-1">
                                        <div className="w-44 h-4 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                                        <div className="w-28 h-3 rounded bg-slate-200/70 dark:bg-slate-800/60 animate-pulse" />
                                    </div>
                                </div>
                                <div className="hidden sm:block w-24 h-4 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                                <div className="hidden md:block w-20 h-4 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                                <div className="w-16 h-6 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LoadingState;
