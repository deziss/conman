import React, { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { 
    CpuChipIcon, 
    ServerIcon, 
    CircleStackIcon, 
    PlayIcon, 
    StopIcon, 
    TrashIcon, 
    ArrowPathIcon, 
    CubeIcon,
    PhotoIcon,
    InformationCircleIcon,
    GlobeAltIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';

// -- Linear Progress Bar Component --
const LinearProgress = ({ percent, color }: { percent: number, color: string }) => {
    // Static color mapping using inline styles to prevent Tailwind purging
    const colorMap: Record<string, string> = {
        'indigo': '#6366f1',
        'purple': '#a855f7', 
        'emerald': '#10b981',
        'cyan': '#06b6d4',
        'rose': '#f43f5e',
        'amber': '#f59e0b'
    };

    const barColor = colorMap[color] || '#6366f1';

    return (
        <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
            <div 
                className="h-2 rounded-full transition-all duration-1000 ease-out"
                style={{ 
                    width: `${percent}%`,
                    backgroundColor: barColor 
                }}
            />
        </div>
    );
};

// -- Stat Card with Linear Bar (Compact) --
const StatCard = ({ title, percent, used, total, icon: Icon, color }: any) => {
    const textColorMap: Record<string, string> = {
        'indigo': '#818cf8',
        'purple': '#c084fc',
        'emerald': '#34d399',
        'cyan': '#22d3ee',
        'rose': '#fb7185',
        'amber': '#fbbf24'
    };

    const textColor = textColorMap[color] || '#818cf8';

    return (
        <div className="p-2 bg-slate-100 dark:bg-black/20 rounded-lg border border-slate-200 dark:border-white/5">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-1.5">
                    <Icon className="w-3.5 h-3.5" style={{ color: textColor }} />
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{title}</span>
                </div>
                <span className="text-xs font-bold text-slate-900 dark:text-white">{percent}%</span>
            </div>
            
            <LinearProgress percent={percent} color={color} />
            
            <div className="flex justify-between text-[10px] mt-1 font-mono">
                <span style={{ color: textColor }}>{used}</span>
                <span className="text-slate-500 dark:text-slate-600">{total}</span>
            </div>
        </div>
    );
};

// -- Environment Card with Stats --
const EnvironmentCard = ({ env, stats, systemInfo, isActive, onClick }: any) => {
    const formatSize = (bytes: number) => {
        if (!bytes && bytes !== 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const cpuPercent = stats?.cpu_percent ? Math.round(stats.cpu_percent) : 0;
    const totalCores = systemInfo?.NCPU || 0;
    const usedCores = Math.round((cpuPercent / 100) * totalCores * 10) / 10; // Estimated used cores

    return (
        <GlassCard 
            className={`p-5 cursor-pointer transition-all hover:scale-[1.02] ${isActive ? 'ring-2 ring-cyan-500' : ''}`}
            onClick={onClick}
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${isActive ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400' : 'bg-slate-200 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400'}`}>
                        <GlobeAltIcon className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">{typeof env.name === 'string' ? env.name : 'Host'}</h3>
                        <p className="text-xs text-slate-500 font-mono">{typeof env.host === 'string' ? env.host : (env.host_info?.hostname || 'localhost')}</p>
                    </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-bold ${
                    isActive 
                        ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30' 
                        : 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-500 border border-slate-200 dark:border-slate-600'
                }`}>
                    {isActive ? 'Active' : 'Idle'}
                </span>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3">
                <StatCard 
                    title="CPU" 
                    percent={cpuPercent}
                    used={`${usedCores} cores`}
                    total={`${totalCores} cores`}
                    icon={CpuChipIcon}
                    color="indigo"
                />
                <StatCard 
                    title="Memory" 
                    percent={stats?.memory_percent ? Math.round(stats.memory_percent) : 0}
                    used={formatSize(stats?.memory_used || 0)}
                    total={formatSize(stats?.memory_total || 0)}
                    icon={CircleStackIcon}
                    color="purple"
                />
                <StatCard 
                    title="Disk" 
                    percent={stats?.disk_percent ? Math.round(stats.disk_percent) : 0}
                    used={formatSize(stats?.disk_used || 0)}
                    total={formatSize(stats?.disk_total || 0)}
                    icon={ServerIcon}
                    color="emerald"
                />
            </div>

            {/* Quick Info */}
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/5 flex items-center justify-between text-xs">
                <div className="flex space-x-4">
                    <span className="text-slate-500 dark:text-slate-400">
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">{env.running_containers || 0}</span> running
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                        <span className="text-slate-700 dark:text-slate-300 font-bold">{env.total_containers || 0}</span> total
                    </span>
                </div>
                <span className="text-slate-500">{typeof env.images === 'number' ? env.images : (Array.isArray(env.images) ? env.images.length : 0)} images</span>
            </div>
        </GlassCard>
    );
};

const SectionHeader = ({ title, subTitle, actions }: any) => (
    <div className="flex items-center justify-between mb-6">
        <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subTitle}</p>
        </div>
        <div className="flex space-x-3">{actions}</div>
    </div>
);

export const Dashboard = () => {
    const navigate = useNavigate();
    const { refreshInterval } = useSettings();
    const [loading, setLoading] = useState(true);
    const [systemInfo, setSystemInfo] = useState<any>(null);
    const [systemStats, setSystemStats] = useState<any>(null);
    const [containers, setContainers] = useState<any[]>([]);
    const [images, setImages] = useState<any[]>([]);
    const [environments, setEnvironments] = useState<any[]>([]);

    useEffect(() => {
        const fetchData = async () => {
             try {
                const [sysRes, contRes, imgRes, statsRes, envRes] = await Promise.all([
                    api.get('/docker/system/info').catch(() => ({ data: {} })),
                    api.get('/docker/containers').catch(() => ({ data: [] })),
                    api.get('/docker/images').catch(() => ({ data: [] })),
                    api.get('/docker/system/stats').catch(() => ({ data: null })),
                    api.get('/agents').catch(() => ({ data: [] }))
                ]);
                
                setSystemInfo(sysRes.data);
                setContainers(contRes.data || []);
                setImages(imgRes.data || []);
                setSystemStats(statsRes.data);
                setEnvironments(envRes.data || []);
             } catch (e) {
                 console.error("Dashboard data load error", e);
             } finally {
                 setLoading(false);
             }
        };
        fetchData();

        // Poll stats based on interval
        const interval = setInterval(async () => {
            try {
                const statsRes = await api.get('/docker/system/stats');
                setSystemStats(statsRes.data);
                // Also optionally refresh containers/envs to keep dashboard live
                 const [contRes, envRes] = await Promise.all([
                    api.get('/docker/containers').catch(() => ({ data: [] })),
                    api.get('/agents').catch(() => ({ data: [] }))
                ]);
                setContainers(contRes.data || []);
                setEnvironments(envRes.data || []);

            } catch (e) { /* ignore silent updates */ }
        }, refreshInterval);

        return () => clearInterval(interval);
    }, [refreshInterval]);

    // Derived States
    const runningContainers = containers.filter(c => c.state === 'running');
    const stoppedContainers = containers.filter(c => c.state !== 'running');
    const recentContainers = [...containers].slice(0, 5); 
    const largestImages = [...images].sort((a, b) => b.size - a.size).slice(0, 5);

    const formatSize = (bytes: number) => {
        if (!bytes && bytes !== 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleAction = (action: string) => {
        toast('Action triggered: ' + action, { icon: '🚧' });
    };

    // Create a "local" environment for current host
    const localEnvironment = {
        id: 'local',
        name: systemInfo?.Name || 'Local Docker',
        host: 'localhost',
        running_containers: runningContainers.length,
        total_containers: containers.length,
        images: images.length
    };

    return (
        <div className="space-y-8 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                     <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-1">
                        Dashboard
                    </h1>
                     <p className="text-slate-500 dark:text-slate-400">Overview of your Container Environments</p>
                </div>
                <div className="flex space-x-3">
                    <button onClick={() => handleAction('Start All')} className="flex items-center px-4 py-2 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 rounded-lg hover:bg-emerald-500 hover:text-white transition-colors text-sm font-medium">
                        <PlayIcon className="w-4 h-4 mr-2" />
                        Start All ({stoppedContainers.length})
                    </button>
                    <button onClick={() => handleAction('Stop All')} className="flex items-center px-4 py-2 bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 rounded-lg hover:bg-rose-500 hover:text-white transition-colors text-sm font-medium">
                        <StopIcon className="w-4 h-4 mr-2" />
                        Stop All ({runningContainers.length})
                    </button>
                    <button onClick={() => handleAction('Prune')} className="flex items-center px-4 py-2 bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 rounded-lg hover:bg-amber-500 hover:text-white transition-colors text-sm font-medium">
                        <TrashIcon className="w-4 h-4 mr-2" />
                        Prune
                    </button>
                    <button onClick={() => window.location.reload()} className="flex items-center px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-sm font-medium">
                        <ArrowPathIcon className="w-4 h-4 mr-2" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Environments Section with Stats */}
            <div>
                <SectionHeader 
                    title="Environments" 
                    subTitle="Docker hosts with real-time resource monitoring"
                    actions={
                        <button onClick={() => navigate('/hosts')} className="text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium flex items-center">
                            Manage <span className="ml-1">→</span>
                        </button>
                    }
                />
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Local Environment Card */}
                    <EnvironmentCard 
                        env={localEnvironment}
                        stats={systemStats}
                        systemInfo={systemInfo}
                        isActive={true}
                        onClick={() => {}}
                    />
                    
                    {/* Remote Environments */}
                    {environments.map((env: any) => (
                        <EnvironmentCard 
                            key={env.id}
                            env={env}
                            stats={null}
                            systemInfo={null}
                            isActive={false}
                            onClick={() => navigate(`/hosts/${env.id}`)}
                        />
                    ))}
                    
                    {/* Add Environment Card */}
                    <GlassCard 
                        className="p-5 cursor-pointer transition-all hover:scale-[1.02] border-dashed border-2 border-slate-300 dark:border-white/10 hover:border-cyan-500/50 dark:hover:border-cyan-500/30 flex items-center justify-center min-h-[200px]"
                        onClick={() => navigate('/hosts')}
                    >
                        <div className="text-center">
                            <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                                <span className="text-2xl text-slate-500 dark:text-slate-400">+</span>
                            </div>
                            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Add Environment</p>
                            <p className="text-xs text-slate-500 dark:text-slate-600 mt-1">Connect a remote Docker host</p>
                        </div>
                    </GlassCard>
                </div>
            </div>

            {/* Resources Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Recent Containers */}
                <div>
                     <SectionHeader 
                        title="Containers" 
                        subTitle="Recent containers"
                        actions={
                             <button onClick={() => navigate('/containers')} className="text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium flex items-center">
                                View All <span className="ml-1">→</span>
                             </button>
                        }
                    />
                    <GlassCard className="p-0 overflow-hidden">
                        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                            <thead className="bg-slate-100 dark:bg-black/20 text-xs text-slate-500 uppercase font-medium">
                                <tr>
                                    <th className="px-6 py-3">Name</th>
                                    <th className="px-6 py-3">Image</th>
                                    <th className="px-6 py-3 text-right">State</th>
                                    <th className="px-6 py-3 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                {recentContainers.map(c => (
                                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer" onClick={() => navigate(`/containers/${c.id}`)}>
                                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white flex items-center space-x-3">
                                            <CubeIcon className="w-4 h-4 text-slate-500" />
                                            <span className="truncate max-w-[120px]" title={c.name}>{c.name?.replace('/', '') || 'Unnamed'}</span>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs text-slate-500 truncate max-w-[150px]" title={c.image}>
                                            {c.image?.split(':')[0] || '<none>'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                             <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${
                                                c.state === 'running' 
                                                ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' 
                                                : 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600'
                                            }`}>
                                                {c.state}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right text-xs font-mono">
                                            {c.status}
                                        </td>
                                    </tr>
                                ))}
                                {recentContainers.length === 0 && (
                                    <tr><td colSpan={4} className="text-center py-6 text-slate-600">No containers found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </GlassCard>
                </div>

                {/* Largest Images */}
                 <div>
                     <SectionHeader 
                        title="Images" 
                        subTitle="Largest images"
                        actions={
                             <button onClick={() => navigate('/images')} className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium flex items-center">
                                View All <span className="ml-1">→</span>
                             </button>
                        }
                    />
                    <GlassCard className="p-0 overflow-hidden">
                        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                             <thead className="bg-slate-100 dark:bg-black/20 text-xs text-slate-500 uppercase font-medium">
                                <tr>
                                    <th className="px-6 py-3">Repository</th>
                                    <th className="px-6 py-3">Tag</th>
                                    <th className="px-6 py-3 text-right">Status</th>
                                    <th className="px-6 py-3 text-right">Size</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                 {largestImages.map(img => (
                                    <tr key={img.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer" onClick={() => navigate(`/images/${img.id}`)}>
                                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white flex items-center space-x-3">
                                            <PhotoIcon className="w-4 h-4 text-slate-500" />
                                            <span className="truncate max-w-[140px]" title={img.repo}>{img.repo || '<none>'}</span>
                                        </td>
                                         <td className="px-6 py-4 font-mono text-xs text-slate-500">
                                            {img.tags && img.tags.length > 0 ? img.tags[0].split(':')[1] || 'latest' : '<none>'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                             <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${
                                                img.status === 'used' 
                                                ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' 
                                                : 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-500 border-slate-300 dark:border-slate-600'
                                            }`}>
                                                {img.status === 'used' ? 'Used' : 'Unused'}
                                            </span>
                                        </td>
                                         <td className="px-6 py-4 text-right font-mono text-slate-700 dark:text-slate-300">
                                            {formatSize(img.size)}
                                        </td>
                                    </tr>
                                ))}
                                {largestImages.length === 0 && (
                                    <tr><td colSpan={4} className="text-center py-6 text-slate-600">No images found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </GlassCard>
                </div>

            </div>
        </div>
    );
};