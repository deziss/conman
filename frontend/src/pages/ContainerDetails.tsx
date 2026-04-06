import { useParams, Link } from 'react-router-dom';
import { GlassCard } from '../components/ui/GlassCard';
import { Terminal } from '../components/Terminal';
import { FileBrowser } from '../components/FileBrowser';
import { ContainerLogs } from '../components/ContainerLogs';

import { StatsChart } from '../components/StatsChart';
import { 
    ArrowLeftIcon, 
    PlayIcon, 
    StopIcon, 
    ArrowPathIcon, 
    TrashIcon, 
    CommandLineIcon, 
    DocumentTextIcon,
    InformationCircleIcon,
    ChartBarIcon,
    Cog6ToothIcon,
    FolderIcon,

    GlobeAltIcon,

    ClockIcon,
    CubeIcon,
    ShieldCheckIcon,
    CpuChipIcon,
    TagIcon,
    ServerStackIcon,
    KeyIcon,
    LockClosedIcon,
    CircleStackIcon,
    WrenchScrewdriverIcon
} from '@heroicons/react/24/solid';
import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { clsx } from 'clsx';
import { useHost } from '../contexts/HostContext';
import { mapAgentContainerToDetails } from '../utils/containerMapper';

interface ContainerDetails {
    Id: string;
    Name: string;
    State: {
        Status: string;
        Running: boolean;
        Paused: boolean;
        StartedAt: string;
        Pid: number;
    };
    Created: string;
    Image: string;
    Config?: {
        Cmd?: string[];
        Entrypoint?: string[];
        WorkingDir?: string;
        Env?: string[];
        Labels?: Record<string, string>;
        User?: string;
        Tty?: boolean;
        OpenStdin?: boolean;
        AttachStdin?: boolean;
        AttachStdout?: boolean;
        AttachStderr?: boolean;
    };
    NetworkSettings?: {
        IPAddress?: string;
        Gateway?: string;
        MacAddress?: string;
        Networks?: Record<string, any>; // Relaxed type for now or fix strict structure
        Ports?: Record<string, Array<{ HostIp: string; HostPort: string }> | null>;
    };
    Mounts?: Array<{ 
        Type: string; 
        Source: string; 
        Destination: string;
        Mode?: string;
        RW?: boolean;
        Propagation?: string;
        Driver?: string;
        Name?: string;
    }>;
    HostConfig?: {
        RestartPolicy?: { Name: string; MaximumRetryCount?: number };
        Privileged?: boolean;
        ReadonlyRootfs?: boolean;
        CapAdd?: string[];
        CapDrop?: string[];
        SecurityOpt?: string[];
        CpuShares?: number;
        Memory?: number;
        MemorySwap?: number;
        MemoryReservation?: number;
        NanoCpus?: number;
        CpuPeriod?: number;
        CpuQuota?: number;
        CpusetCpus?: string;
        CpusetMems?: string;
        Devices?: Array<{ PathOnHost: string; PathInContainer: string; CgroupPermissions: string }>;
        DeviceRequests?: Array<{ Driver?: string; Count?: number; DeviceIDs?: string[]; Capabilities?: string[][] }>;
        NetworkMode?: string;
        PidMode?: string;
        UsernsMode?: string;
        IpcMode?: string;
        Ulimits?: Array<{ Name: string; Soft: number; Hard: number }>;
        OomScoreAdj?: number;
        ShmSize?: number;
    };
    Platform?: string;
    Driver?: string;
    GraphDriver?: {
        Name?: string;
        Data?: Record<string, string>;
    };
}

interface StatPoint {
    time: string;
    value: number;
}

type TabType = 'overview' | 'metrics' | 'logs' | 'shell' | 'files' | 'config' | 'networks' | 'resources';


// Helper to format time ago
const timeAgo = (dateString: string) => {
    if (!dateString || dateString === '0001-01-01T00:00:00Z') return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `about ${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
};

declare global {
    interface Window {
        lastCpu?: number;
        lastSys?: number;
        lastNetRx?: number;
        lastNetTx?: number;
        lastDisk?: number;
    }
}

const formatDate = (dateString: string) => {
    if (!dateString || dateString === '0001-01-01T00:00:00Z') return '-';
    return new Date(dateString).toLocaleString();
};

const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Info Card Component
const InfoCard = ({ label, value, mono = false, className = '' }: { 
    label: string; 
    value: React.ReactNode; 
    mono?: boolean;
    className?: string;
}) => (
    <div className={clsx("bg-slate-800/50 rounded-lg p-4 border border-white/5", className)}>
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">{label}</div>
        <div className={clsx(
            "text-sm text-slate-200 break-all",
            mono && "font-mono text-xs"
        )}>
            {value || '-'}
        </div>
    </div>
);

// Environment Variable Card
const EnvVarCard = ({ name, value }: { name: string; value: string }) => (
    <div className="bg-slate-800/50 rounded-lg p-4 border border-white/5">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2 truncate" title={name}>{name}</div>
        <div className="text-sm text-slate-200 font-mono break-all truncate" title={value}>
            {value || '-'}
        </div>
    </div>
);

// Badge for port mappings
const PortBadge = ({ mapping }: { mapping: string }) => (
    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-mono bg-purple-500/20 text-purple-400 border border-purple-500/30">
        {mapping}
        <span className="ml-1.5 text-[10px] bg-purple-500/30 px-1 rounded">TCP</span>
    </span>
);

// Storage Mount Card
const MountCard = ({ mount }: { mount: ContainerDetails['Mounts'][0] }) => (
    <div className="bg-slate-800/30 rounded-xl p-5 border border-white/5">
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
                <div className={clsx(
                    "p-2 rounded-lg",
                    mount.Type === 'bind' ? "bg-cyan-500/20" : "bg-purple-500/20"
                )}>
                    {mount.Type === 'bind' ? (
                        <FolderIcon className="w-4 h-4 text-cyan-400" />
                    ) : (
                        <CircleStackIcon className="w-4 h-4 text-purple-400" />
                    )}
                </div>
                <div>
                    <div className="text-sm font-medium text-white">{mount.Name || 'Host directory'}</div>
                    <div className="text-xs text-slate-500">{mount.Type} mount</div>
                </div>
            </div>
            <span className={clsx(
                "text-xs px-2 py-0.5 rounded font-mono",
                mount.RW ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-400"
            )}>
                {mount.RW ? 'RW' : 'RO'}
            </span>
        </div>
        
        <div className="space-y-3">
            <div>
                <div className="text-xs text-slate-500 mb-1">Container</div>
                <div className="text-sm text-cyan-400 font-mono">{mount.Destination}</div>
            </div>
            {mount.Type === 'bind' ? (
                <div>
                    <div className="text-xs text-slate-500 mb-1">Host</div>
                    <div className="text-sm text-slate-300 font-mono">{mount.Source}</div>
                </div>
            ) : (
                <div>
                    <div className="text-xs text-slate-500 mb-1">Volume</div>
                    <div className="text-sm text-slate-300 font-mono">{mount.Source}</div>
                </div>
            )}
            {mount.Propagation && (
                <div>
                    <div className="text-xs text-slate-500 mb-1">Propagation</div>
                    <div className="text-sm text-slate-300">{mount.Propagation}</div>
                </div>
            )}
            {mount.Driver && (
                <div>
                    <div className="text-xs text-slate-500 mb-1">Driver</div>
                    <div className="text-sm text-slate-300">{mount.Driver}</div>
                </div>
            )}
        </div>
    </div>
);

// Network Card
const NetworkCard = ({ name, network }: { 
    name: string; 
    network: NonNullable<ContainerDetails['NetworkSettings']>['Networks'][string] 
}) => (
    <div className="bg-slate-800/30 rounded-xl p-5 border border-white/5">
        <div className="flex items-center space-x-3 mb-5">
            <div className="p-2 bg-purple-500/20 rounded-lg">
                <GlobeAltIcon className="w-4 h-4 text-purple-400" />
            </div>
            <div>
                <div className="text-sm font-medium text-white">{name}</div>
                <div className="text-xs text-slate-500">Network Interface</div>
            </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
                <div className="text-xs text-slate-500 mb-1">IP Address</div>
                <div className="text-sm text-cyan-400 font-mono">{network.IPAddress || '-'}</div>
            </div>
            <div>
                <div className="text-xs text-slate-500 mb-1">Gateway</div>
                <div className="text-sm text-slate-300 font-mono">{network.Gateway || '-'}</div>
            </div>
            <div>
                <div className="text-xs text-slate-500 mb-1">MAC Address</div>
                <div className="text-sm text-slate-300 font-mono">{network.MacAddress || '-'}</div>
            </div>
            <div>
                <div className="text-xs text-slate-500 mb-1">Subnet</div>
                <div className="text-sm text-slate-300 font-mono">
                    {network.IPAddress && network.IPPrefixLen ? `${network.IPAddress}/${network.IPPrefixLen}` : '-'}
                </div>
            </div>
        </div>
        
        <div className="space-y-3">
            <div>
                <div className="text-xs text-slate-500 mb-1">Network ID</div>
                <div className="text-sm text-slate-400 font-mono text-xs break-all">{network.NetworkID || '-'}</div>
            </div>
            <div>
                <div className="text-xs text-slate-500 mb-1">Endpoint ID</div>
                <div className="text-sm text-slate-400 font-mono text-xs break-all">{network.EndpointID || '-'}</div>
            </div>
            {network.Aliases && network.Aliases.length > 0 && (
                <div>
                    <div className="text-xs text-slate-500 mb-1">Aliases</div>
                    <div className="text-sm text-slate-300">
                        {network.Aliases.map((alias: string, i: number) => (
                            <div key={i} className="font-mono">{alias}</div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    </div>
);

export const ContainerDetails = () => {
    const { id } = useParams<{ id: string }>();
    const [container, setContainer] = useState<ContainerDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [cpuData, setCpuData] = useState<StatPoint[]>([]);
    const [memData, setMemData] = useState<StatPoint[]>([]);
    const [netData, setNetData] = useState<StatPoint[]>([]);
    const [diskData, setDiskData] = useState<StatPoint[]>([]);
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const wsRef = useRef<WebSocket | null>(null);

    const { currentHost } = useHost();

    const fetchDetails = async () => {
        if (!id || !currentHost) return;
        setLoading(true);

        try {
             // Unified API Fetch
             const { data } = await api.get(`/agents/${currentHost.id}/containers/${id}`);
             // If we need custom mapping for agent containers vs local?
             // The unified API should ideally return consistent structure.
             // But if `data` is raw docker JSON from agent, we might need mapping depending on how backend proxies it.
             // Backend ProxyContainerDetails usually returns raw Docker JSON.
             // Let's assume consistent structure or map if needed.
             // Previous code mapped agent containers from `currentHost.containers` list but fetched local from `/docker/...`
             // Now we fetch from `/agents/...`.
             
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
        
        if (!id || !currentHost) return;
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const token = localStorage.getItem('token');
        
        // Unified WebSocket URL
        const wsUrl = `${protocol}//${window.location.host}/api/v1/agents/${currentHost.id}/containers/${id}/stats?token=${token}`;

        if (wsUrl) {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onmessage = (event) => {
                try {
                    const stats = JSON.parse(event.data);
                    const now = new Date().toLocaleTimeString();
                    
                    // Memory
                    if (stats.memory_stats && stats.memory_stats.usage) {
                        const memMb = stats.memory_stats.usage / 1024 / 1024;
                        setMemData(prev => [...prev.slice(-29), { time: now, value: memMb }]);
                    }

                    // CPU
                    if (stats.cpu_stats && stats.cpu_stats.cpu_usage && stats.cpu_stats.system_cpu_usage) {
                        if (window.lastCpu && window.lastSys) {
                            const deltaCpu = stats.cpu_stats.cpu_usage.total_usage - window.lastCpu;
                            const deltaSys = stats.cpu_stats.system_cpu_usage - window.lastSys;
                            if (deltaSys > 0) {
                                const perc = (deltaCpu / deltaSys) * (stats.cpu_stats.online_cpus || 1) * 100;
                                setCpuData(prev => [...prev.slice(-29), { time: now, value: perc }]);
                            }
                        }
                        window.lastCpu = stats.cpu_stats.cpu_usage.total_usage;
                        window.lastSys = stats.cpu_stats.system_cpu_usage;
                    }

                    // Network I/O (Sum of all interfaces)
                    if (stats.networks) {
                        let rx = 0;
                        let tx = 0;
                        Object.values(stats.networks).forEach((net: any) => {
                            rx += net.rx_bytes || 0;
                            tx += net.tx_bytes || 0;
                        });
                        // Use RX for the chart for simplicity, or sum? Let's use RX + TX or just RX.
                        // Chart usually shows rate, but here we show total bytes or current usage? 
                        // Docker stats stream gives cumulative counters. We need rate.
                        // For simplicity in this demo, let's just show total KB transferred delta? 
                        // Actually, standard stats charts usually plot the counter or the rate.
                        // Let's plot rate if we can store previous state, but calculating rate requires previous timestamp.
                        // For now, let's just plot the cumulative value converted to KB creates a rising line, which is fine for "Total I/O".
                        // OR better: Windowed diff.
                        
                        // We will use a global window variable for prev net stats to calculate rate if possible, 
                        // but React state is cleaner. Since we are inside onmessage closure, we rely on window or refs.
                        // Let's stick to simple "Total KB" for now to match the "Memory Usage" (which is state, not rate).
                        // Wait, Memory is usage (state), CPU is usage (rate). 
                        // Network I/O typically implies Rate (KB/s).
                        // Let's try to calculate rate.
                        
                        if (window.lastNetRx !== undefined && window.lastNetTx !== undefined) {
                             const delta = (rx - window.lastNetRx) + (tx - window.lastNetTx);
                             setNetData(prev => [...prev.slice(-29), { time: now, value: delta / 1024 }]); // KB delta
                        }
                        window.lastNetRx = rx;
                        window.lastNetTx = tx;
                    }

                    // Disk I/O
                    if (stats.blkio_stats && stats.blkio_stats.io_service_bytes_recursive) {
                        let io = 0;
                        stats.blkio_stats.io_service_bytes_recursive.forEach((s: any) => {
                            if (s.op.toLowerCase() === 'read' || s.op.toLowerCase() === 'write') {
                                io += s.value;
                            }
                        });
                        
                        if (window.lastDisk !== undefined) {
                            const delta = io - window.lastDisk;
                            setDiskData(prev => [...prev.slice(-29), { time: now, value: delta / 1024 }]); // KB delta
                        }
                        window.lastDisk = io;
                    }

                } catch (e) {}
            };

            return () => {
                if (wsRef.current) wsRef.current.close();
            };
        }
    }, [id, currentHost]);

    // Derived State
    const envVars = container?.Config?.Env?.map(e => {
        const [name, ...rest] = e.split('=');
        return { name, value: rest.join('=') };
    }) || [];

    const labels = container?.Config?.Labels || {};

    const handleAction = async (action: string) => {
        if (!container || !currentHost) return;
        try {
            // Unified API Action
            const endpoint = `/agents/${currentHost.id}/containers/${container.Id}/${action}`;

            await api.post(endpoint);
            toast.success(`Container ${action}ed`);
            setTimeout(fetchDetails, 1000);
        } catch (error) {
             toast.error(`Failed to ${action} container`);
        }
    };

    if (loading) return <div className="text-center mt-20 text-slate-500">Loading details...</div>;
    if (!container) return <div className="text-center mt-20 text-slate-500">Container not found</div>;

    const isRunning = container.State.Running;

    return (
        <div className="h-full flex flex-col space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <button 
                        onClick={() => window.history.back()} 
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                    >
                        <ArrowLeftIcon className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center space-x-3">
                            <span>{container.Name}</span>
                            <span className={clsx(
                                "px-2 py-0.5 text-xs font-medium rounded uppercase",
                                isRunning ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-700 text-slate-400 border border-slate-600"
                            )}>
                                {container.State.Status}
                            </span>
                        </h1>
                        <div className="flex items-center space-x-4 text-xs text-slate-500 mt-1">
                            <span className="font-mono">{container.Id.substring(0, 12)}</span>
                            <span>•</span>
                            <span>{container.Image}</span>
                            <span>•</span>
                            <span>Created {new Date(container.Created).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    {isRunning ? (
                        <>
                            <button onClick={() => handleAction('stop')} className="p-2 hover:bg-white/10 rounded-lg text-rose-400" title="Stop">
                                <StopIcon className="w-5 h-5" />
                            </button>
                            <button onClick={() => handleAction('restart')} className="p-2 hover:bg-white/10 rounded-lg text-amber-400" title="Restart">
                                <ArrowPathIcon className="w-5 h-5" />
                            </button>
                        </>
                    ) : (
                        <button onClick={() => handleAction('start')} className="p-2 hover:bg-white/10 rounded-lg text-emerald-400" title="Start">
                            <PlayIcon className="w-5 h-5" />
                        </button>
                    )}
                    <button onClick={() => handleAction('remove')} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-rose-400" title="Remove">
                        <TrashIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex space-x-1 bg-white/5 p-1 rounded-lg w-fit">
                {(['overview', 'logs', 'shell', 'files', 'config', 'networks', 'resources'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={clsx(
                            "px-4 py-2 rounded-md text-sm font-medium transition-all",
                            activeTab === tab 
                                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                                : "text-slate-400 hover:text-white hover:bg-white/5"
                        )}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-hidden min-h-0">
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-y-auto pr-2 pb-20">
                         {/* Stats Column */}
                         <div className="space-y-6">
                            <GlassCard className="p-4">
                                <h3 className="text-sm font-medium text-slate-400 mb-4 flex items-center space-x-2">
                                    <CpuChipIcon className="w-4 h-4" />
                                    <span>CPU Usage</span>
                                </h3>
                                <div className="h-32">
                                    <StatsChart data={cpuData} color="#818cf8" />
                                </div>
                            </GlassCard>
                            <GlassCard className="p-4">
                                <h3 className="text-sm font-medium text-slate-400 mb-4 flex items-center space-x-2">
                                    <CircleStackIcon className="w-4 h-4" />
                                    <span>Memory Usage</span>
                                </h3>
                                <div className="h-32">
                                    <StatsChart data={memData} color="#34d399" />
                                </div>
                            </GlassCard>
                            <GlassCard className="p-4">
                                <h3 className="text-sm font-medium text-slate-400 mb-4 flex items-center space-x-2">
                                    <GlobeAltIcon className="w-4 h-4" />
                                    <span>Network I/O</span>
                                </h3>
                                <div className="h-32">
                                    <StatsChart data={netData} color="#f472b6" />
                                </div>
                            </GlassCard>
                         </div>

                         {/* Details Column */}
                         <div className="lg:col-span-2 space-y-6">
                             <GlassCard className="p-6">
                                 <h3 className="text-lg font-semibold text-white mb-6">Container Details</h3>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                     <InfoCard label="ID" value={container.Id} mono />
                                     <InfoCard label="Name" value={container.Name} />
                                     <InfoCard label="Image" value={container.Image} mono />
                                     <InfoCard label="Command" value={container.Config?.Cmd?.join(' ') || '-'} mono />
                                     <InfoCard label="State" value={container.State.Status} />
                                     <InfoCard label="Created" value={new Date(container.Created).toLocaleString()} />
                                 </div>
                             </GlassCard>

                             {/* Mounts */}
                             <GlassCard className="p-6">
                                 <h3 className="text-lg font-semibold text-white mb-6 flex items-center space-x-2">
                                     <FolderIcon className="w-5 h-5 text-amber-400" />
                                     <span>Mounts</span>
                                 </h3>
                                 {container.Mounts && container.Mounts.length > 0 ? (
                                    <div className="space-y-3">
                                        {container.Mounts.map((mount, i) => (
                                            <div key={i} className="flex items-center space-x-4 p-3 bg-slate-800/50 rounded-lg border border-white/5">
                                                <div className="flex-1">
                                                    <div className="text-xs text-slate-500 uppercase mb-1">Source</div>
                                                    <div className="text-sm text-slate-300 font-mono truncate">{mount.Source}</div>
                                                </div>
                                                <div className="text-slate-500">→</div>
                                                <div className="flex-1">
                                                     <div className="text-xs text-slate-500 uppercase mb-1">Target</div>
                                                     <div className="text-sm text-emerald-400 font-mono truncate">{mount.Destination}</div>
                                                </div>
                                                <div className="px-2 py-1 rounded bg-slate-700 text-xs text-slate-300 uppercase">
                                                    {mount.Type}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                 ) : (
                                     <div className="text-slate-500">No mounts configured</div>
                                 )}
                             </GlassCard>
                         </div>
                    </div>
                )}
                
          {activeTab === 'logs' && (
              <div className="h-full">
                  <ContainerLogs 
                    containerId={id || ''} 
                    agentId={currentHost?.id}
                  />
              </div>
          )}

          {/* Shell Tab */}
          {activeTab === 'shell' && (
              <GlassCard className="h-full p-0 overflow-hidden">
                  <Terminal 
                    containerId={id || ''} 
                    agentId={currentHost?.id}
                  />
              </GlassCard>
          )}

          {/* Files Tab */}
          {activeTab === 'files' && (
              <GlassCard className="h-full p-0 overflow-hidden">
                  <FileBrowser 
                    containerId={id || ''} 
                    agentId={currentHost?.id}
                  />
              </GlassCard>
          )}




          {/* Configuration Tab */}
          {activeTab === 'config' && (
              <div className="space-y-6">
                  {/* Environment Variables */}
                  <GlassCard className="p-6">
                      <div className="flex items-center space-x-3 mb-6">
                          <div className="p-2 bg-emerald-500/20 rounded-lg">
                              <KeyIcon className="w-5 h-5 text-emerald-400" />
                          </div>
                          <div>
                              <h3 className="text-lg font-semibold text-white">Environment Variables</h3>
                              <p className="text-xs text-slate-500">Runtime environment variables for your container</p>
                          </div>
                      </div>
                      {envVars.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {envVars.map((env, i) => (
                                  <EnvVarCard key={i} name={env.name} value={env.value} />
                              ))}
                          </div>
                      ) : (
                          <div className="text-slate-500 text-sm">No environment variables configured</div>
                      )}
                  </GlassCard>

                  {/* Labels */}
                  <GlassCard className="p-6">
                      <div className="flex items-center space-x-3 mb-6">
                          <div className="p-2 bg-purple-500/20 rounded-lg">
                              <TagIcon className="w-5 h-5 text-purple-400" />
                          </div>
                          <div>
                              <h3 className="text-lg font-semibold text-white">Labels</h3>
                              <p className="text-xs text-slate-500">Metadata labels attached to this container for organization and automation</p>
                          </div>
                      </div>
                      {Object.keys(labels).length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {Object.entries(labels).map(([key, value], i) => (
                                  <EnvVarCard key={i} name={key} value={value} />
                              ))}
                          </div>
                      ) : (
                          <div className="text-slate-500 text-sm">No labels configured</div>
                      )}
                  </GlassCard>
              </div>
          )}

          {/* Networks Tab */}
          {activeTab === 'networks' && (
              <GlassCard className="p-6">
                  <div className="flex items-center space-x-3 mb-6">
                      <div className="p-2 bg-purple-500/20 rounded-lg">
                          <GlobeAltIcon className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                          <h3 className="text-lg font-semibold text-white">Networks</h3>
                          <p className="text-xs text-slate-500">Network interfaces and connectivity configuration for this container</p>
                      </div>
                  </div>
                  {container.NetworkSettings?.Networks && Object.keys(container.NetworkSettings.Networks).length > 0 ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {Object.entries(container.NetworkSettings.Networks).map(([name, network]) => (
                              <NetworkCard key={name} name={name} network={network} />
                          ))}
                      </div>
                  ) : (
                      <div className="text-slate-500 text-sm">No network interfaces configured</div>
                  )}
              </GlassCard>
          )}

          {/* Resources & Security Tab */}
          {activeTab === 'resources' && (
              <div className="space-y-6">
                  {/* Security Configuration */}
                  <GlassCard className="p-6">
                      <div className="flex items-center space-x-3 mb-6">
                          <div className="p-2 bg-rose-500/20 rounded-lg">
                              <ShieldCheckIcon className="w-5 h-5 text-rose-400" />
                          </div>
                          <div>
                              <h3 className="text-lg font-semibold text-white">Security & Permissions</h3>
                              <p className="text-xs text-slate-500">Container security configuration and access controls</p>
                          </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                          <InfoCard 
                              label="Privileged" 
                              value={
                                  <span className={container.HostConfig?.Privileged ? "text-rose-400" : "text-emerald-400"}>
                                      {container.HostConfig?.Privileged ? 'Yes' : 'No'}
                                  </span>
                              } 
                          />
                          <InfoCard 
                              label="Read-Only Rootfs" 
                              value={
                                  <span className={container.HostConfig?.ReadonlyRootfs ? "text-emerald-400" : "text-slate-400"}>
                                      {container.HostConfig?.ReadonlyRootfs ? 'Yes' : 'No'}
                                  </span>
                              } 
                          />
                          <InfoCard label="User" value={container.Config?.User || 'root'} mono />
                          <InfoCard label="TTY" value={container.Config?.Tty ? 'Enabled' : 'Disabled'} />
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-slate-800/50 rounded-lg p-4 border border-white/5">
                              <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Capabilities Added</div>
                              <div className="flex flex-wrap gap-2">
                                  {container.HostConfig?.CapAdd && container.HostConfig.CapAdd.length > 0 ? (
                                      container.HostConfig.CapAdd.map((cap, i) => (
                                          <span key={i} className="text-xs px-2 py-1 bg-amber-500/20 text-amber-400 rounded font-mono">{cap}</span>
                                      ))
                                  ) : (
                                      <span className="text-slate-500 text-sm">None</span>
                                  )}
                              </div>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-4 border border-white/5">
                              <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Capabilities Dropped</div>
                              <div className="flex flex-wrap gap-2">
                                  {container.HostConfig?.CapDrop && container.HostConfig.CapDrop.length > 0 ? (
                                      container.HostConfig.CapDrop.map((cap, i) => (
                                          <span key={i} className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded font-mono">{cap}</span>
                                      ))
                                  ) : (
                                      <span className="text-slate-500 text-sm">None</span>
                                  )}
                              </div>
                          </div>
                      </div>

                      {container.HostConfig?.SecurityOpt && container.HostConfig.SecurityOpt.length > 0 && (
                          <div className="mt-4 bg-slate-800/50 rounded-lg p-4 border border-white/5">
                              <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Security Options</div>
                              <div className="flex flex-wrap gap-2">
                                  {container.HostConfig.SecurityOpt.map((opt, i) => (
                                      <span key={i} className="text-xs px-2 py-1 bg-slate-700 text-slate-300 rounded font-mono">{opt}</span>
                                  ))}
                              </div>
                          </div>
                      )}
                  </GlassCard>

                  {/* Resource Limits */}
                  <GlassCard className="p-6">
                      <div className="flex items-center space-x-3 mb-6">
                          <div className="p-2 bg-cyan-500/20 rounded-lg">
                              <CpuChipIcon className="w-5 h-5 text-cyan-400" />
                          </div>
                          <div>
                              <h3 className="text-lg font-semibold text-white">Resource Limits</h3>
                              <p className="text-xs text-slate-500">CPU, memory, and other resource constraints</p>
                          </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                          <InfoCard 
                              label="CPU Shares" 
                              value={container.HostConfig?.CpuShares || 'Unlimited'} 
                          />
                          <InfoCard 
                              label="CPU Quota" 
                              value={container.HostConfig?.CpuQuota ? `${container.HostConfig.CpuQuota}` : 'Unlimited'} 
                          />
                          <InfoCard 
                              label="CPU Period" 
                              value={container.HostConfig?.CpuPeriod ? `${container.HostConfig.CpuPeriod}µs` : 'Default'} 
                          />
                          <InfoCard 
                              label="CPUset CPUs" 
                              value={container.HostConfig?.CpusetCpus || 'All'} 
                              mono 
                          />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                          <InfoCard 
                              label="Memory Limit" 
                              value={container.HostConfig?.Memory ? formatBytes(container.HostConfig.Memory) : 'Unlimited'} 
                          />
                          <InfoCard 
                              label="Memory Swap" 
                              value={container.HostConfig?.MemorySwap ? formatBytes(container.HostConfig.MemorySwap) : 'Unlimited'} 
                          />
                          <InfoCard 
                              label="Memory Reservation" 
                              value={container.HostConfig?.MemoryReservation ? formatBytes(container.HostConfig.MemoryReservation) : 'None'} 
                          />
                          <InfoCard 
                              label="SHM Size" 
                              value={container.HostConfig?.ShmSize ? formatBytes(container.HostConfig.ShmSize) : 'Default (64MB)'} 
                          />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <InfoCard label="OOM Score Adj" value={container.HostConfig?.OomScoreAdj ?? 0} />
                          <InfoCard label="PID Mode" value={container.HostConfig?.PidMode || 'Default'} />
                          <InfoCard label="IPC Mode" value={container.HostConfig?.IpcMode || 'Default'} />
                          <InfoCard label="Network Mode" value={container.HostConfig?.NetworkMode || 'Default'} />
                      </div>
                  </GlassCard>

                  {/* GPU / Device Requests */}
                  {container.HostConfig?.DeviceRequests && container.HostConfig.DeviceRequests.length > 0 && (
                      <GlassCard className="p-6">
                          <div className="flex items-center space-x-3 mb-6">
                              <div className="p-2 bg-purple-500/20 rounded-lg">
                                  <ServerStackIcon className="w-5 h-5 text-purple-400" />
                              </div>
                              <div>
                                  <h3 className="text-lg font-semibold text-white">GPU & Device Requests</h3>
                                  <p className="text-xs text-slate-500">GPU and specialized device allocations</p>
                              </div>
                          </div>
                          <div className="space-y-4">
                              {container.HostConfig.DeviceRequests.map((device, i) => (
                                  <div key={i} className="bg-slate-800/50 rounded-lg p-4 border border-white/5">
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                          <div>
                                              <div className="text-xs text-slate-500 uppercase mb-1">Driver</div>
                                              <div className="text-sm text-slate-200">{device.Driver || 'nvidia'}</div>
                                          </div>
                                          <div>
                                              <div className="text-xs text-slate-500 uppercase mb-1">Count</div>
                                              <div className="text-sm text-slate-200">{device.Count === -1 ? 'All' : device.Count}</div>
                                          </div>
                                          <div>
                                              <div className="text-xs text-slate-500 uppercase mb-1">Device IDs</div>
                                              <div className="text-sm text-slate-200">{device.DeviceIDs?.join(', ') || 'All'}</div>
                                          </div>
                                          <div>
                                              <div className="text-xs text-slate-500 uppercase mb-1">Capabilities</div>
                                              <div className="text-sm text-slate-200">{device.Capabilities?.flat().join(', ') || '-'}</div>
                                          </div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </GlassCard>
                  )}

                  {/* Devices */}
                  {container.HostConfig?.Devices && container.HostConfig.Devices.length > 0 && (
                      <GlassCard className="p-6">
                          <div className="flex items-center space-x-3 mb-6">
                              <div className="p-2 bg-amber-500/20 rounded-lg">
                                  <WrenchScrewdriverIcon className="w-5 h-5 text-amber-400" />
                              </div>
                              <div>
                                  <h3 className="text-lg font-semibold text-white">Device Mappings</h3>
                                  <p className="text-xs text-slate-500">Host devices accessible to this container</p>
                              </div>
                          </div>
                          <div className="space-y-2">
                              {container.HostConfig.Devices.map((device, i) => (
                                  <div key={i} className="flex items-center space-x-3 p-3 bg-slate-800/50 rounded-lg border border-white/5">
                                      <span className="text-sm text-slate-400 font-mono">{device.PathOnHost}</span>
                                      <span className="text-slate-600">→</span>
                                      <span className="text-sm text-cyan-400 font-mono">{device.PathInContainer}</span>
                                      <span className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded">{device.CgroupPermissions}</span>
                                  </div>
                              ))}
                          </div>
                      </GlassCard>
                  )}

                  {/* Container Runtime Info */}
                  <GlassCard className="p-6">
                      <div className="flex items-center space-x-3 mb-6">
                          <div className="p-2 bg-slate-500/20 rounded-lg">
                              <InformationCircleIcon className="w-5 h-5 text-slate-400" />
                          </div>
                          <div>
                              <h3 className="text-lg font-semibold text-white">Runtime Information</h3>
                              <p className="text-xs text-slate-500">Container runtime and driver details</p>
                          </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <InfoCard label="Platform" value={container.Platform || 'linux'} />
                          <InfoCard label="Driver" value={container.Driver || '-'} />
                          <InfoCard label="Graph Driver" value={container.GraphDriver?.Name || '-'} />
                          <InfoCard label="Stdin Attached" value={container.Config?.AttachStdin ? 'Yes' : 'No'} />
                      </div>
                  </GlassCard>
              </div>
          )}
      </div>
    </div>
  );
};

declare global {
    interface Window {
        lastCpu?: number;
        lastSys?: number;
        lastNetRx?: number;
        lastNetTx?: number;
        lastDisk?: number;
    }
}
