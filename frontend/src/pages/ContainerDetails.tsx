import { useParams, Link } from 'react-router-dom';
import { GlassCard } from '../components/ui/GlassCard';
import { Terminal } from '../components/Terminal';
import { ContainerLogs } from '../components/ContainerLogs';
import { StatsChart } from '../components/StatsChart';
import { ArrowLeftIcon, PlayIcon, StopIcon, ArrowPathIcon, TrashIcon, PauseIcon, CommandLineIcon, DocumentTextIcon } from '@heroicons/react/24/solid';
import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { toast } from 'react-hot-toast';

interface ContainerDetails {
    Id: string;
    Name: string;
    State: {
        Status: string;
        Running: boolean;
        Paused: boolean;
    };
    Created: string;
    Image: string;
}

interface StatPoint {
    time: string;
    value: number;
}

export const ContainerDetails = () => {
    const { id } = useParams<{ id: string }>();
    const [container, setContainer] = useState<ContainerDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [cpuData, setCpuData] = useState<StatPoint[]>([]);
    const [memData, setMemData] = useState<StatPoint[]>([]);
    const [activeTab, setActiveTab] = useState<'terminal' | 'logs'>('terminal');
    const wsRef = useRef<WebSocket | null>(null);

    const fetchDetails = async () => {
        try {
            const { data } = await api.get(`/containers/${id}`);
            // Docker Inspect returns Name like "/conman-backend-1". Clean it.
            if (data.Name && data.Name.startsWith('/')) {
                data.Name = data.Name.substring(1);
            }
            setContainer(data);
        } catch (error) {
            console.error("Failed to fetch container details", error);
            toast.error("Failed to load container details");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDetails();
        
        // Setup Stats Stream
        if (!id) return;
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const token = localStorage.getItem('token');
        const wsUrl = `${protocol}//${window.location.host}/api/v1/containers/${id}/stats?token=${token}`;
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
            try {
                const stats = JSON.parse(event.data);
                const now = new Date().toLocaleTimeString();
                
                // Memory (Bytes -> MB)
                if (stats.memory_stats && stats.memory_stats.usage) {
                    const memMb = stats.memory_stats.usage / 1024 / 1024;
                    setMemData(prev => [...prev.slice(-19), { time: now, value: memMb }]);
                }

                // CPU
                if (stats.cpu_stats && stats.cpu_stats.cpu_usage && stats.cpu_stats.system_cpu_usage) {
                     // Simple cache mechanism to store prev
                     if (window.lastCpu && window.lastSys) {
                        const deltaCpu = stats.cpu_stats.cpu_usage.total_usage - window.lastCpu;
                        const deltaSys = stats.cpu_stats.system_cpu_usage - window.lastSys;
                         if (deltaSys > 0) {
                             const perc = (deltaCpu / deltaSys) * (stats.cpu_stats.online_cpus || 1) * 100;
                             setCpuData(prev => [...prev.slice(-19), { time: now, value: perc }]);
                         }
                     }
                     window.lastCpu = stats.cpu_stats.cpu_usage.total_usage;
                     window.lastSys = stats.cpu_stats.system_cpu_usage;
                }

            } catch (e) {
                // Ignore parse errors
            }
        };

        return () => {
            if (wsRef.current) wsRef.current.close();
        };
    }, [id]);

    const handleAction = async (action: string) => {
        if (!container) return;
        try {
            await api.post(`/containers/${container.Id}/${action}`);
            toast.success(`Container ${action}ed`);
            fetchDetails(); // Refresh state
        } catch (error) {
             toast.error(`Failed to ${action} container`);
        }
    };

    if (loading) return <div className="text-center mt-20 text-slate-500">Loading details...</div>;
    if (!container) return <div className="text-center mt-20 text-slate-500">Container not found</div>;

    const isRunning = container.State.Running;
    const isPaused = container.State.Paused;

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
      <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link to="/containers" className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-white">
                <ArrowLeftIcon className="w-6 h-6" />
            </Link>
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                {container.Name}
                <span className={`text-xs px-2 py-0.5 rounded-full border ${isRunning ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10' : 'border-slate-500/50 text-slate-400 bg-slate-500/10'} font-mono uppercase`}>
                    {container.State.Status}
                </span>
                </h2>
                <p className="text-sm font-mono text-cyan-400">{id?.substring(0, 12)}</p>
                <p className="text-xs text-slate-500 mt-1">{container.Image}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
             {isRunning && !isPaused && (
                 <button onClick={() => handleAction('pause')} className="px-3 py-1.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded hover:bg-amber-500/20 flex items-center gap-1 transition-colors">
                     <PauseIcon className="w-4 h-4" /> Pause
                 </button>
             )}
             {isPaused && (
                 <button onClick={() => handleAction('unpause')} className="px-3 py-1.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded hover:bg-emerald-500/20 flex items-center gap-1 transition-colors">
                     <PlayIcon className="w-4 h-4" /> Resume
                 </button>
             )}
             {!isRunning ? (
                 <button onClick={() => handleAction('start')} className="px-3 py-1.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded hover:bg-emerald-500/20 flex items-center gap-1 transition-colors">
                     <PlayIcon className="w-4 h-4" /> Start
                 </button>
             ) : (
                <>
                 <button onClick={() => handleAction('restart')} className="px-3 py-1.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded hover:bg-blue-500/20 flex items-center gap-1 transition-colors">
                     <ArrowPathIcon className="w-4 h-4" /> Restart
                 </button>
                 <button onClick={() => handleAction('stop')} className="px-3 py-1.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded hover:bg-rose-500/20 flex items-center gap-1 transition-colors">
                     <StopIcon className="w-4 h-4" /> Stop
                 </button>
                </>
             )}
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Left Column: Stats */}
        <div className="space-y-6 flex flex-col">
           <GlassCard className="flex-1 min-h-[200px] flex flex-col justify-center">
             <StatsChart data={cpuData} color="#22d3ee" label="CPU Usage" unit="%" />
           </GlassCard>
           <GlassCard className="flex-1 min-h-[200px] flex flex-col justify-center">
             <StatsChart data={memData} color="#8b5cf6" label="Memory Usage" unit="MB" />
           </GlassCard>
        </div>

        {/* Right Column: Console (Tabs: Terminal / Logs) */}
        <GlassCard className="lg:col-span-2 p-0 overflow-hidden flex flex-col">
             <div className="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between">
                <div className="flex space-x-2">
                    <button 
                        onClick={() => setActiveTab('terminal')}
                        className={`flex items-center space-x-2 px-3 py-1 rounded text-xs font-medium transition-colors ${activeTab === 'terminal' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <CommandLineIcon className="w-4 h-4" />
                        <span>Terminal</span>
                    </button>
                    <button 
                        onClick={() => setActiveTab('logs')}
                        className={`flex items-center space-x-2 px-3 py-1 rounded text-xs font-medium transition-colors ${activeTab === 'logs' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <DocumentTextIcon className="w-4 h-4" />
                        <span>Logs</span>
                    </button>
                </div>
                <div className="flex space-x-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
                </div>
             </div>
             <div className="flex-1 min-h-0 bg-slate-900 p-2 relative">
                 {/* 
                   We should always render Terminal to keep the session alive, just hide it? 
                   Actually xterm handles display:none badly (fit addon breaks). 
                   Better to conditionally render but know session might reset.
                   For logs it's fine. For terminal, maybe keep it mounted but z-indexed?
                   Let's stick to conditional for now to save resources.
                 */}
                 {activeTab === 'terminal' && <Terminal containerId={id || ''} />}
                 {activeTab === 'logs' && <ContainerLogs containerId={id || ''} />}
             </div>
        </GlassCard>
      </div>
    </div>
  );
};

// Quick fix for global TS on window
declare global {
    interface Window {
        lastCpu?: number;
        lastSys?: number;
    }
}
