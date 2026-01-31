import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { 
    CpuChipIcon, 
    CircleStackIcon, 
    ServerIcon, 
    ArrowLeftIcon,
    CubeIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import { Loading } from '../components/ui/Loading';

// Reusing StatCard components from Dashboard (should be refactored to common later)
const LinearProgress = ({ percent, color }: { percent: number, color: string }) => {
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
            <div className="h-2 rounded-full transition-all duration-1000 ease-out" style={{ width: `${percent}%`, backgroundColor: barColor }} />
        </div>
    );
};

const StatCard = ({ title, percent, used, total, icon: Icon, color }: any) => {
    const textColorMap: Record<string, string> = {
        'indigo': '#818cf8', 'purple': '#c084fc', 'emerald': '#34d399', 'cyan': '#22d3ee', 'rose': '#fb7185', 'amber': '#fbbf24'
    };
    const textColor = textColorMap[color] || '#818cf8';
    return (
        <div className="p-4 bg-slate-100 dark:bg-black/20 rounded-lg border border-slate-200 dark:border-white/5">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                    <Icon className="w-5 h-5" style={{ color: textColor }} />
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{title}</span>
                </div>
                <span className="text-lg font-bold text-slate-900 dark:text-white">{percent}%</span>
            </div>
            <LinearProgress percent={percent} color={color} />
            <div className="flex justify-between text-xs mt-2 font-mono">
                <span style={{ color: textColor }}>{used}</span>
                <span className="text-slate-500 dark:text-slate-600">{total}</span>
            </div>
        </div>
    );
};

export const HostDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [agent, setAgent] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchAgent = async () => {
        try {
            const { data } = await api.get(`/agents/${id}`);
            setAgent(data);
        } catch (error) {
            console.error("Failed to fetch agent", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAgent();
        const interval = setInterval(fetchAgent, 3000); // Poll every 3s
        return () => clearInterval(interval);
    }, [id]);

    if (loading) return <Loading />;
    if (!agent) return <div className="text-center py-10">Agent not found</div>;

    const stats = agent.stats || {};
    const systemInfo = agent.host_info || {};
    const metrics = agent.metrics || {}; // The new metrics map

    const containers = (agent.containers || []).map((c: any) => ({
        ...c,
        name: c.name || (c.names && c.names.length > 0 ? c.names[0].replace(/^\//, '') : 'Unnamed')
    }));

    const formatSize = (bytes: number) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <button onClick={() => navigate('/')} className="flex items-center text-slate-500 hover:text-cyan-500 transition-colors">
                    <ArrowLeftIcon className="w-4 h-4 mr-2" />
                    Back to Dashboard
                </button>
            </div>

            {/* Header */}
            <div>
                 <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-1">
                    {agent.name}
                </h1>
                <p className="text-slate-500 dark:text-slate-400 font-mono text-sm">
                    {systemInfo.hostname} • {systemInfo.os} • {systemInfo.docker_version} • {agent.status}
                </p>
            </div>

            {/* System Stats */}
            <GlassCard className="p-6">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">System Resources</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     <StatCard 
                        title="CPU" 
                        percent={stats.cpu_percent ? Math.round(stats.cpu_percent) : 0}
                        used={`${systemInfo.cpus || 0} Cores`}
                        total="100%"
                        icon={CpuChipIcon}
                        color="indigo"
                    />
                    <StatCard 
                        title="Memory" 
                        percent={stats.memory_percent ? Math.round(stats.memory_percent) : 0}
                        used={formatSize(stats.memory_used || 0)}
                        total={formatSize(stats.memory_total || 0)}
                        icon={CircleStackIcon}
                        color="purple"
                    />
                    <StatCard 
                        title="Disk" 
                        percent={stats.disk_percent ? Math.round(stats.disk_percent) : 0}
                        used={formatSize(stats.disk_used || 0)}
                        total={formatSize(stats.disk_total || 0)}
                        icon={ServerIcon}
                        color="emerald"
                    />
                </div>
            </GlassCard>

            {/* Containers List with Metrics */}
            <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Containers</h3>
                <GlassCard className="p-0 overflow-hidden">
                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                        <thead className="bg-slate-100 dark:bg-black/20 text-xs text-slate-500 uppercase font-medium">
                            <tr>
                                <th className="px-6 py-3">Name</th>
                                <th className="px-6 py-3">Image</th>
                                <th className="px-6 py-3 text-right">State</th>
                                <th className="px-6 py-3 text-right">CPU</th>
                                <th className="px-6 py-3 text-right">Memory</th>
                                <th className="px-6 py-3 text-right">Net I/O</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {containers.map((c: any) => {
                                const m = metrics[c.id] || {};
                                return (
                                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white flex items-center space-x-3">
                                            <CubeIcon className="w-4 h-4 text-slate-500" />
                                            <span className="truncate max-w-[150px]" title={c.name}>{c.name || 'Unnamed'}</span>
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
                                        {/* METRICS COLUMNS */}
                                        <td className="px-6 py-4 text-right font-mono text-xs text-indigo-500">
                                            {m.cpu_percent !== undefined ? `${m.cpu_percent.toFixed(2)}%` : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-xs text-purple-500">
                                            {m.memory_usage ? formatSize(m.memory_usage) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-xs text-slate-500">
                                            {m.network_rx ? `↓${formatSize(m.network_rx)}` : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                            {(!containers || containers.length === 0) && (
                                <tr><td colSpan={6} className="text-center py-6 text-slate-600">No containers found</td></tr>
                            )}
                        </tbody>
                    </table>
                </GlassCard>
            </div>
        </div>
    );
};
