import { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { PlayIcon, StopIcon, ArrowPathIcon, CpuChipIcon, TrashIcon, EyeIcon, CommandLineIcon } from '@heroicons/react/24/solid';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { InspectModal } from '../components/InspectModal';
import { useSidebar } from '../layouts/DashboardLayout';

interface Container {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  created: number;
  ports: string[];
  ip_address: string;
  cpu_usage: string;
  memory_usage: string;
  disk_io: string;
}

export const Containers = () => {
  const [containers, setContainers] = useState<Container[]>([]);
  // Store history for sparklines: { containerId: { cpu: [], mem: [] } }
  const [statsHistory, setStatsHistory] = useState<Record<string, { cpu: {value: number}[], mem: {value: number}[] }>>({});
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'running' | 'exited' | 'paused'>('all');
  const [sortOrder, setSortOrder] = useState<'name' | 'status' | 'state'>('state');
  const [inspectData, setInspectData] = useState<any>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const { isCollapsed } = useSidebar();

  const fetchContainers = async () => {
    try {
      const { data } = await api.get('/docker/containers');
      setContainers(data);

      // Update history
      setStatsHistory(prev => {
        const newHistory = { ...prev };
        data.forEach((c: Container) => {
           if (!newHistory[c.id]) newHistory[c.id] = { cpu: [], mem: [] };
           
           // Parse CPU string "12.34%" -> 12.34
           const cpuVal = parseFloat(c.cpu_usage.replace('%', '')) || 0;
           // Parse Mem string "12.34 MB" -> bytes (simplified for sparkline, just use raw number if units consistent, 
           // but units change. Let's just strip non-numeric and hope for scale consistency or parse properly.
           // For simple sparkline, let's just use the numeric part assuming unit doesn't jump wildly in 5s)
           const memVal = parseFloat(c.memory_usage) || 0;

           const maxPoints = 20;
           const newCpu = [...newHistory[c.id].cpu, { value: cpuVal }].slice(-maxPoints);
           const newMem = [...newHistory[c.id].mem, { value: memVal }].slice(-maxPoints);
           
           newHistory[c.id] = { cpu: newCpu, mem: newMem };
        });
        return newHistory;
      });

    } catch (error: any) {
      console.error("Failed to fetch containers", error);
      if (loading) { // Only show toast on first load failure to avoid spamming
          toast.error("Failed to load containers: " + (error.response?.data?.error || error.message));
      }
    } finally {
        // Keep loading false after first load to avoid flickering
      if (loading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchContainers();
    const interval = setInterval(fetchContainers, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (id: string, action: 'start' | 'stop' | 'remove') => {
    try {
        if (action === 'remove') {
             await api.delete(`/docker/containers/${id}`);
        } else {
             await api.post(`/docker/containers/${id}/${action}`);
        }
      toast.success(`Container ${action}ed`);
      fetchContainers();
    } catch (error) {
      toast.error(`Failed to ${action} container`);
    }
  };

  const handleInspect = async (id: string, e: React.MouseEvent) => {
      e.preventDefault(); // Prevent Link navigation if inside link (but we put button outside)
      e.stopPropagation();
      try {
          // Backend already has Get Container Details endpoint at /containers/:id which returns inspect JSON
          const { data } = await api.get(`/docker/containers/${id}`);
          setInspectData(data);
          setInspectModalOpen(true);
      } catch (error) {
          toast.error("Failed to inspect container");
      }
  }

  const getStatusColor = (state: string) => {
      if (state === 'running') return 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]';
      if (state === 'exited') return 'bg-slate-500';
      return 'bg-amber-400';
  };

  const formatTime = (created: number) => {
      // created is in seconds, convert to ms
      return new Date(created * 1000).toLocaleString();
  }

  const filteredContainers = containers
    .filter(c => filterStatus === 'all' || c.state === filterStatus)
    .sort((a, b) => {
      if (sortOrder === 'name') return a.name.localeCompare(b.name);
      if (sortOrder === 'status') return a.status.localeCompare(b.status);
      const stateOrder = { running: 0, paused: 1, exited: 2 };
      return (stateOrder[a.state as keyof typeof stateOrder] ?? 3) - (stateOrder[b.state as keyof typeof stateOrder] ?? 3);
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-500 dark:from-slate-100 dark:to-slate-400">
          Containers
        </h2>
        <GlassCard className="px-4 py-2 flex items-center space-x-2 text-sm text-cyan-600 dark:text-cyan-400">
           <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
            </span>
            <span>Live Connection</span>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <GlassCard className="p-6 relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <CpuChipIcon className="w-16 h-16 text-slate-900 dark:text-white" />
            </div>
            <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Total Containers</p>
            <p className="text-4xl font-mono font-bold mt-2 text-slate-900 dark:text-slate-100">{containers.length}</p>
        </GlassCard>
         <GlassCard className="p-6 relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <PlayIcon className="w-16 h-16 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Running</p>
            <p className="text-4xl font-mono font-bold mt-2 text-emerald-600 dark:text-emerald-400">{containers.filter(c => c.state === 'running').length}</p>
        </GlassCard>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-8 mb-4 gap-4">
        <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-300">Container List</h3>
        
        <div className="flex items-center space-x-4">
          <div className="flex bg-white dark:bg-slate-800/50 rounded-lg p-1 border border-slate-200 dark:border-slate-700/50">
            {(['all', 'running', 'exited', 'paused'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
                  filterStatus === status 
                    ? 'bg-cyan-500/10 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700/50'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 text-xs rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block p-2 outline-none"
          >
            <option value="state">Sort by State</option>
            <option value="name">Sort by Name</option>
            <option value="status">Sort by Status</option>
          </select>
        </div>
      </div>
      
      {loading ? (
          <div className="text-slate-500 text-center py-10 animate-pulse">Loading containers...</div>
      ) : (
      <div className={`grid gap-6 ${
          isCollapsed 
            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5' 
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4'
        }`}>
        {filteredContainers.map((container) => (
          <GlassCard key={container.id} hover className="flex flex-col justify-between group">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(container.state)}`} />
                  <Link to={`/containers/${container.id}`} className="block">
                    <h4 className="font-semibold text-lg text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors truncate max-w-[200px] cursor-pointer hover:underline">
                      {container.name || container.id.substring(0, 12)}
                    </h4>
                  </Link>
                </div>
                <p className="text-xs text-slate-500 font-mono mt-1 ml-5 truncate max-w-[250px]">{container.image}</p>
                
                {/* Enhanced Info Grid */}
                <div className="mt-4 ml-5 grid grid-cols-2 gap-x-8 gap-y-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                    <div>
                        <span className="text-slate-400 dark:text-slate-600 block text-[10px] uppercase">IP Address</span>
                        <span>{container.ip_address || '-'}</span>
                    </div>
                     <div>
                        <span className="text-slate-400 dark:text-slate-600 block text-[10px] uppercase">Created</span>
                        <span>{formatTime(container.created)}</span>
                    </div>
                    {container.ports && container.ports.length > 0 && (
                        <div className="col-span-2">
                             <span className="text-slate-400 dark:text-slate-600 block text-[10px] uppercase">Ports</span>
                             <span className="break-all">{container.ports.join(', ')}</span>
                        </div>
                    )}
                </div>
                
                 {/* Resource Usage Stats */}
                 <div className="mt-3 ml-5 pt-3 border-t border-slate-200 dark:border-slate-700/50 grid grid-cols-2 gap-4 text-xs font-mono text-slate-500 dark:text-slate-400">
                    <div>
                         <div className="flex justify-between items-end mb-1">
                             <span className="text-slate-400 dark:text-slate-600 block text-[10px] uppercase">CPU</span>
                             <span className={(container.cpu_usage && container.cpu_usage !== "0.00%") ? "text-emerald-500 font-bold" : ""}>{container.cpu_usage || '0.00%'}</span>
                         </div>
                         <div className="h-8 w-full bg-slate-100 dark:bg-slate-800/50 rounded overflow-hidden">
                             <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={statsHistory[container.id]?.cpu || []}>
                                    <defs>
                                        <linearGradient id={`colorCpu-${container.id}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={1} fill={`url(#colorCpu-${container.id})`} isAnimationActive={false} />
                                    <YAxis domain={[0, 100]} hide />
                                </AreaChart>
                             </ResponsiveContainer>
                         </div>
                    </div>
                     <div>
                         <div className="flex justify-between items-end mb-1">
                             <span className="text-slate-400 dark:text-slate-600 block text-[10px] uppercase">Mem</span>
                             <span>{container.memory_usage || '0 B'}</span>
                         </div>
                          <div className="h-8 w-full bg-slate-100 dark:bg-slate-800/50 rounded overflow-hidden">
                             <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={statsHistory[container.id]?.mem || []}>
                                    <defs>
                                        <linearGradient id={`colorMem-${container.id}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <Area type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={1} fill={`url(#colorMem-${container.id})`} isAnimationActive={false} />
                                </AreaChart>
                             </ResponsiveContainer>
                         </div>
                    </div>
                     <div className="col-span-2">
                         <div className="flex justify-between items-end mb-1">
                            <span className="text-slate-400 dark:text-slate-600 block text-[10px] uppercase">Disk I/O</span>
                            <span>{container.disk_io || '0 B / 0 B'}</span>
                         </div>
                         {/* Simple visual bar for I/O activity if non-zero */}
                         <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden">
                             <div 
                                className="h-full bg-amber-400 rounded-full transition-all duration-500" 
                                style={{ width: container.disk_io && container.disk_io !== "0 B / 0 B" ? '100%' : '0%' }} // Animated "active" indicator
                             />
                         </div>
                    </div>
                 </div>

              </div>
              <div className="p-2 glass rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex-shrink-0" onClick={fetchContainers}>
                <ArrowPathIcon className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700/50">
              <div className="flex space-x-4 text-xs font-mono text-slate-500 dark:text-slate-400">
                <span className="uppercase">{container.status}</span>
              </div>
              
              <div className="flex space-x-2">
                 <button 
                    onClick={(e) => handleInspect(container.id, e)}
                    className="p-2 hover:bg-cyan-500/20 text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 rounded-lg transition-colors"
                    title="Inspect Container"
                 >
                     <EyeIcon className="w-5 h-5" />
                 </button>
                  <Link 
                     to={`/containers/${container.id}/logs`}
                     className="p-2 hover:bg-violet-500/20 text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 rounded-lg transition-colors"
                     title="View Logs"
                  >
                      <CommandLineIcon className="w-5 h-5" />
                  </Link>
                  <button 
                    onClick={() => handleAction(container.id, 'start')}
                    disabled={container.state === 'running'}
                    className="p-2 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    <PlayIcon className="w-5 h-5" />
                 </button>
                 <button 
                    onClick={() => handleAction(container.id, 'stop')}
                    disabled={container.state !== 'running'}
                    className="p-2 hover:bg-rose-500/20 text-rose-600 dark:text-rose-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    <StopIcon className="w-5 h-5" />
                 </button>
                  <button 
                    onClick={() => handleAction(container.id, 'remove')}
                    className="p-2 hover:bg-slate-500/20 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg transition-colors">
                    <TrashIcon className="w-5 h-5" />
                 </button>
              </div>
            </div>
            
            <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500/0 via-cyan-500/50 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </GlassCard>
        ))}
      </div>
      )}

      <InspectModal 
        isOpen={inspectModalOpen} 
        onClose={() => setInspectModalOpen(false)} 
        title="Container Details" 
        data={inspectData} 
      />
    </div>
  );
};
