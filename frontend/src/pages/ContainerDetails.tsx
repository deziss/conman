import { useParams, Link } from 'react-router-dom';
import { GlassCard } from '../components/ui/GlassCard';
import { Terminal } from '../components/Terminal';
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
        Networks?: Record<string, {
            IPAddress?: string;
            Gateway?: string;
            MacAddress?: string;
            IPPrefixLen?: number;
            NetworkID?: string;
            EndpointID?: string;
            Aliases?: string[];
        }>;
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

type TabType = 'overview' | 'metrics' | 'logs' | 'shell' | 'config' | 'networks' | 'resources';

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
                        {network.Aliases.map((alias, i) => (
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
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const wsRef = useRef<WebSocket | null>(null);

    const { currentHost, isLocalHost } = useHost();

    const fetchDetails = async () => {
        if (!id) return;
        setLoading(true);

        try {
            if (isLocalHost) {
                const { data } = await api.get(`/docker/containers/${id}`);
                if (data.Name && data.Name.startsWith('/')) {
                    data.Name = data.Name.substring(1);
                }
                setContainer(data);
            } else {
                // Agent Context
                if (currentHost?.containers) {
                    const found = currentHost.containers.find((c: any) => c.id === id);
                    if (found) {
                        const mapped = mapAgentContainerToDetails(found);
                        setContainer(mapped as any);
                    }
                }
            }
        } catch (error) {
            console.error("Failed to fetch container details", error);
            toast.error("Failed to load container details");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDetails();
        
        if (!id) return;
        
        if (isLocalHost) {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const token = localStorage.getItem('token');
            const wsUrl = `${protocol}//${window.location.host}/api/v1/docker/containers/${id}/stats?token=${token}`;
            
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onmessage = (event) => {
                try {
                    const stats = JSON.parse(event.data);
                    const now = new Date().toLocaleTimeString();
                    
                    if (stats.memory_stats && stats.memory_stats.usage) {
                        const memMb = stats.memory_stats.usage / 1024 / 1024;
                        setMemData(prev => [...prev.slice(-29), { time: now, value: memMb }]);
                    }

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
                } catch (e) {}
            };

            return () => {
                if (wsRef.current) wsRef.current.close();
            };
        }
    }, [id, isLocalHost, currentHost]);

    const handleAction = async (action: string) => {
        if (!container) return;
        try {
            const endpoint = isLocalHost 
                ? `/docker/containers/${container.Id}/${action}`
                : `/agents/${currentHost?.id}/containers/${container.Id}/${action}`;

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
    const isPaused = container.State.Paused;
    
    // Extract data for display
    const ipAddress = container.NetworkSettings?.IPAddress || 
        Object.values(container.NetworkSettings?.Networks || {})[0]?.IPAddress || '-';
    
    const ports = container.NetworkSettings?.Ports || {};
    const portMappings = Object.entries(ports)
        .filter(([_, bindings]) => bindings && bindings.length > 0)
        .map(([containerPort, bindings]) => {
            const binding = bindings![0];
            return `${binding.HostPort}:${containerPort.split('/')[0]}`;
        });
    
    const volumeCount = container.Mounts?.length || 0;
    const networkCount = Object.keys(container.NetworkSettings?.Networks || {}).length;
    const restartPolicy = container.HostConfig?.RestartPolicy?.Name || 'no';
    const command = container.Config?.Cmd?.join(' ') || '-';
    const workingDir = container.Config?.WorkingDir || '/';
    
    // Parse environment variables
    const envVars = (container.Config?.Env || []).map(env => {
        const idx = env.indexOf('=');
        return { name: env.substring(0, idx), value: env.substring(idx + 1) };
    });
    
    // Labels
    const labels = container.Config?.Labels || {};

    const tabs = [
        { id: 'overview' as TabType, label: 'Overview', icon: InformationCircleIcon },
        { id: 'metrics' as TabType, label: 'Metrics', icon: ChartBarIcon },
        ...(isLocalHost ? [
            { id: 'logs' as TabType, label: 'Logs', icon: DocumentTextIcon },
            { id: 'shell' as TabType, label: 'Shell', icon: CommandLineIcon },
        ] : []),
        { id: 'config' as TabType, label: 'Configuration', icon: Cog6ToothIcon },
        { id: 'networks' as TabType, label: 'Networks', icon: GlobeAltIcon },
        { id: 'resources' as TabType, label: 'Resources & Security', icon: ShieldCheckIcon },
    ];

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link to="/containers" className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors">
                <ArrowLeftIcon className="w-4 h-4" />
                <span className="text-sm">Back</span>
            </Link>
            <div className="flex items-center space-x-3">
                <h2 className="text-xl font-semibold text-white">{container.Name}</h2>
                <span className={clsx(
                    "text-xs px-2.5 py-1 rounded-full font-medium",
                    isRunning 
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                        : "bg-slate-500/20 text-slate-400 border border-slate-500/30"
                )}>
                    {container.State.Status}
                </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
             {isRunning && !isPaused && (
                 <button onClick={() => handleAction('stop')} className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg hover:bg-rose-500/30 transition-colors">
                     <StopIcon className="w-4 h-4" />
                     <span className="text-sm">Stop</span>
                 </button>
             )}
             {isRunning && (
                 <button onClick={() => handleAction('restart')} className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-colors">
                     <ArrowPathIcon className="w-4 h-4" />
                     <span className="text-sm">Restart</span>
                 </button>
             )}
             {!isRunning && (
                 <button onClick={() => handleAction('start')} className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-colors">
                     <PlayIcon className="w-4 h-4" />
                     <span className="text-sm">Start</span>
                 </button>
             )}
             <button onClick={() => handleAction('remove')} className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-700/50 text-slate-400 border border-slate-600/50 rounded-lg hover:bg-slate-700 transition-colors">
                 <TrashIcon className="w-4 h-4" />
                 <span className="text-sm">Remove</span>
             </button>
          </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center space-x-1 border-b border-white/10 pb-px overflow-x-auto">
          {tabs.map(tab => (
              <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                      "flex items-center space-x-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px whitespace-nowrap",
                      activeTab === tab.id
                          ? "text-purple-400 border-purple-500 bg-purple-500/10"
                          : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-white/5"
                  )}
              >
                  <tab.icon className="w-4 h-4" />
                  <span>{tab.label}</span>
              </button>
          ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-auto">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
              <div className="space-y-6">
                  {/* Container Details Header */}
                  <GlassCard className="p-6">
                      <div className="flex items-center space-x-3 mb-6">
                          <div className="p-2 bg-purple-500/20 rounded-lg">
                              <InformationCircleIcon className="w-5 h-5 text-purple-400" />
                          </div>
                          <div>
                              <h3 className="text-lg font-semibold text-white">Container Details</h3>
                              <p className="text-xs text-slate-500">Basic information about this container</p>
                          </div>
                      </div>

                      {/* Top Info Row */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                          <div className="flex items-center space-x-3">
                              <CubeIcon className="w-5 h-5 text-purple-400" />
                              <div>
                                  <div className="text-xs text-slate-500 uppercase">Image</div>
                                  <div className="text-sm text-purple-400 font-mono break-all">{container.Image}</div>
                              </div>
                          </div>
                          <div className="flex items-center space-x-3">
                              <ClockIcon className="w-5 h-5 text-emerald-400" />
                              <div>
                                  <div className="text-xs text-slate-500 uppercase">Uptime</div>
                                  <div className="text-sm text-slate-200">{timeAgo(container.State.StartedAt)}</div>
                              </div>
                          </div>
                          <div className="flex items-center space-x-3">
                              <GlobeAltIcon className="w-5 h-5 text-cyan-400" />
                              <div>
                                  <div className="text-xs text-slate-500 uppercase">IP Address</div>
                                  <div className="text-sm text-cyan-400 font-mono">{ipAddress}</div>
                              </div>
                          </div>
                      </div>

                      {/* Info Cards Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                          <InfoCard label="ID" value={container.Id} mono />
                          <InfoCard label="Created" value={<><div>{timeAgo(container.Created)}</div><div className="text-xs text-slate-500 mt-1">{formatDate(container.Created)}</div></>} />
                          <InfoCard label="Started" value={<><div>{timeAgo(container.State.StartedAt)}</div><div className="text-xs text-slate-500 mt-1">{formatDate(container.State.StartedAt)}</div></>} />
                          <InfoCard label="Restart Policy" value={restartPolicy} />
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                          <InfoCard label="Ports" value={`${portMappings.length} published`} />
                          <InfoCard label="Volumes" value={`${volumeCount} mounts`} />
                          <InfoCard label="Networks" value={`${networkCount} network${networkCount !== 1 ? 's' : ''}`} />
                          <InfoCard label="PID" value={container.State.Pid} mono />
                      </div>

                      {/* Working Directory and Command */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                          <InfoCard label="Working Directory" value={workingDir} mono />
                          <InfoCard label="Command" value={command} mono />
                      </div>

                      {/* Port Mappings */}
                      {portMappings.length > 0 && (
                          <div>
                              <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Port Mappings</div>
                              <div className="flex flex-wrap gap-2">
                                  {portMappings.map((mapping, i) => (
                                      <PortBadge key={i} mapping={mapping} />
                                  ))}
                              </div>
                          </div>
                      )}
                  </GlassCard>

                  {/* Storage & Mounts Section */}
                  {container.Mounts && container.Mounts.length > 0 && (
                      <GlassCard className="p-6">
                          <div className="flex items-center space-x-3 mb-6">
                              <div className="p-2 bg-amber-500/20 rounded-lg">
                                  <CircleStackIcon className="w-5 h-5 text-amber-400" />
                              </div>
                              <div>
                                  <h3 className="text-lg font-semibold text-white">Storage & Mounts</h3>
                                  <p className="text-xs text-slate-500">Volume mounts and storage configuration for persistent data</p>
                              </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {container.Mounts.map((mount, i) => (
                                  <MountCard key={i} mount={mount} />
                              ))}
                          </div>
                      </GlassCard>
                  )}
              </div>
          )}

          {/* Metrics Tab */}
          {activeTab === 'metrics' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                  <GlassCard className="p-6 flex flex-col min-h-[300px]">
                      <div className="flex items-center space-x-3 mb-4">
                          <div className="p-2 bg-cyan-500/20 rounded-lg">
                              <ChartBarIcon className="w-5 h-5 text-cyan-400" />
                          </div>
                          <h3 className="text-lg font-semibold text-white">CPU Usage</h3>
                      </div>
                      <div className="flex-1">
                          <StatsChart data={cpuData} color="#22d3ee" label="CPU Usage" unit="%" />
                      </div>
                  </GlassCard>
                  <GlassCard className="p-6 flex flex-col min-h-[300px]">
                      <div className="flex items-center space-x-3 mb-4">
                          <div className="p-2 bg-purple-500/20 rounded-lg">
                              <ChartBarIcon className="w-5 h-5 text-purple-400" />
                          </div>
                          <h3 className="text-lg font-semibold text-white">Memory Usage</h3>
                      </div>
                      <div className="flex-1">
                          <StatsChart data={memData} color="#8b5cf6" label="Memory Usage" unit="MB" />
                      </div>
                  </GlassCard>
              </div>
          )}

          {/* Logs Tab */}
          {activeTab === 'logs' && (
              <div className="h-full">
                  <ContainerLogs containerId={id || ''} />
              </div>
          )}

          {/* Shell Tab */}
          {activeTab === 'shell' && (
              <GlassCard className="h-full p-0 overflow-hidden">
                  <Terminal containerId={id || ''} />
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
    }
}
