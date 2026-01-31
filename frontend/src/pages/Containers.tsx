import { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { PlayIcon, StopIcon, ArrowPathIcon, CpuChipIcon, TrashIcon, EyeIcon, CommandLineIcon, ServerStackIcon, DocumentTextIcon } from '@heroicons/react/24/solid';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { InspectModal } from '../components/InspectModal';
import { useSidebar } from '../layouts/DashboardLayout';
import { useHost } from '../contexts/HostContext';
import { PageTransition } from '../components/ui/PageTransition';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { AnimatePresence, motion } from 'framer-motion';
import { useSettings } from '../contexts/SettingsContext';

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
  const { refreshInterval } = useSettings();
  const [statsHistory, setStatsHistory] = useState<Record<string, { cpu: {value: number}[], mem: {value: number}[] }>>({});
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'running' | 'exited' | 'paused'>('all');
  const [sortOrder, setSortOrder] = useState<'name' | 'status' | 'state'>('state');
  const [inspectData, setInspectData] = useState<any>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const { isCollapsed } = useSidebar();
  const { currentHost, isLocalHost } = useHost();

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: async () => {}, // Async void
    isDestructive: false,
  });

  const fetchContainers = async () => {
    try {
      const endpoint = isLocalHost ? '/docker/containers' : '/agents/' + (currentHost ? currentHost.id : '') + '/containers';
      const { data } = await api.get(endpoint);
      setContainers(data || []);

      setStatsHistory(prev => {
        const newHistory = { ...prev };
        data.forEach((c: Container) => {
           if (!newHistory[c.id]) newHistory[c.id] = { cpu: [], mem: [] };
           
           const cpuVal = c.cpu_usage ? parseFloat(c.cpu_usage.replace('%', '')) : 0;
           // Heuristic parsing for memory
           let memVal = 0;
           if (c.memory_usage) {
               memVal = parseFloat(c.memory_usage);
               if (c.memory_usage.includes('GB')) memVal *= 1024;
           }

           const maxPoints = 20;
           const newCpu = [...newHistory[c.id].cpu, { value: cpuVal }].slice(-maxPoints);
           const newMem = [...newHistory[c.id].mem, { value: memVal }].slice(-maxPoints);
           
           newHistory[c.id] = { cpu: newCpu, mem: newMem };
        });
        return newHistory;
      });

    } catch (error: any) {
      console.error("Failed to fetch containers", error);
      if (loading) { 
          toast.error("Failed to load containers: " + (error.response?.data?.error || error.message));
      }
    } finally {
      if (loading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchContainers();
    const interval = setInterval(fetchContainers, refreshInterval);
    return () => clearInterval(interval);
  }, [currentHost, isLocalHost, refreshInterval]);

  const executeAction = async (id: string, action: 'start' | 'stop' | 'remove') => {
      let endpoint = '';
      let method: 'post' | 'delete' = 'post';

      if (isLocalHost) {
          endpoint = '/docker/containers/' + id;
          if (action !== 'remove') endpoint += '/' + action;
          if (action === 'remove') method = 'delete';
      } else {
           // Fallback for agent
           endpoint = '/agents/' + (currentHost ? currentHost.id : '') + '/containers/' + id;
           if (action !== 'remove') endpoint += '/' + action;
           if (action === 'remove') method = 'delete';
      }

      const promise = method === 'delete' ? api.delete(endpoint) : api.post(endpoint);
      
      try {
          await toast.promise(promise, {
              loading: `${action.charAt(0).toUpperCase() + action.slice(1)}ing container...`,
              success: `Container ${action}ed successfully`,
              error: `Failed to ${action} container`
          });
          fetchContainers();
      } catch (e) {
          // Toast handles error display
      }
  };

  const handleActionClick = (id: string, action: 'start' | 'stop' | 'remove') => {
      if (action === 'remove' || action === 'stop') {
          setConfirmModal({
              isOpen: true,
              title: `${action.charAt(0).toUpperCase() + action.slice(1)} Container`,
              message: `Are you sure you want to ${action} this container? This action cannot be undone.`,
              isDestructive: true,
              onConfirm: async () => executeAction(id, action)
          });
      } else {
          executeAction(id, action);
      }
  };

  const handleInspect = async (id: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
          const endpoint = isLocalHost ? `/docker/containers/${id}` : `/agents/${currentHost?.id}/containers/${id}`;
          const { data } = await api.get(endpoint);
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
    <PageTransition>
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-500 dark:from-slate-100 dark:to-slate-400">
          Containers
        </h2>
        <div className="flex items-center space-x-3">
          {!isLocalHost && (
           <GlassCard className="px-4 py-2 flex items-center space-x-2 text-sm text-cyan-600 dark:text-cyan-400">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
            </span>
            <span>Live Connection</span>
           </GlassCard>
          )}
          <button onClick={() => fetchContainers()} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
            <ArrowPathIcon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
        </div>
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
                <PlayIcon className="w-16 h-16 text-emerald-500" />
            </div>
            <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Running</p>
            <p className="text-4xl font-mono font-bold mt-2 text-emerald-500">{containers.filter(c => c.state === 'running').length}</p>
        </GlassCard>
        <GlassCard className="p-6 relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <StopIcon className="w-16 h-16 text-amber-500" />
            </div>
             <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Stopped</p>
            <p className="text-4xl font-mono font-bold mt-2 text-amber-500">{containers.filter(c => c.state !== 'running').length}</p>
        </GlassCard>
      </div>

      <div className="flex gap-4 mb-6">
        <select 
          value={filterStatus} 
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="all">All Status</option>
          <option value="running">Running</option>
          <option value="exited">Exited</option>
          <option value="paused">Paused</option>
        </select>
         <select 
          value={sortOrder} 
          onChange={(e) => setSortOrder(e.target.value as any)}
          className="bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="state">Sort by State</option>
          <option value="name">Sort by Name</option>
          <option value="status">Sort by Status</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      <AnimatePresence mode="popLayout">
        {filteredContainers.map(container => (
          <motion.div
            key={container.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            layout
          >
          <GlassCard className="p-0 overflow-hidden hover:ring-1 hover:ring-cyan-500/30 transition-all duration-300 group">
             <div className="p-5 border-b border-slate-200 dark:border-slate-700/50 flex justify-between items-start bg-slate-50/30 dark:bg-slate-800/30">
                <div className="flex items-start space-x-3">
                    <div className={`w-3 h-3 mt-1.5 rounded-full ${getStatusColor(container.state)} transition-all duration-500`}></div>
                    <div>
                        <Link to={'/containers/' + container.id}>
                            <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors cursor-pointer truncate max-w-[200px]" title={container.name.replace(/^\//, '')}>
                                {container.name.replace(/^\//, '')}
                            </h3>
                        </Link>
                        <div className="flex items-center gap-2 mt-1">
                             <p className="text-xs font-mono text-slate-500 bg-slate-200 dark:bg-slate-700/50 px-1.5 py-0.5 rounded">{container.image.substring(0, 25)}{container.image.length > 25 ? '...' : ''}</p>
                             <p className="text-xs text-slate-400">{container.status}</p>
                        </div>
                    </div>
                </div>
                <div className="flex space-x-1 opacity-80">
                   <button 
                        onClick={() => handleActionClick(container.id, container.state === 'running' ? 'stop' : 'start')}
                        className={`p-1.5 rounded-lg transition-colors ${container.state === 'running' ? 'hover:bg-amber-500/10 text-amber-500' : 'hover:bg-emerald-500/10 text-emerald-500'}`}
                        title={container.state === 'running' ? 'Stop' : 'Start'}
                    >
                        {container.state === 'running' ? <StopIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                    </button>
                    <button 
                        onClick={() => handleActionClick(container.id, 'remove')}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors"
                        title="Remove"
                    >
                        <TrashIcon className="w-5 h-5" />
                    </button>
                     <button 
                        onClick={(e) => handleInspect(container.id, e)}
                        className="p-1.5 rounded-lg hover:bg-cyan-500/10 text-cyan-500 transition-colors"
                        title="Inspect"
                    >
                        <EyeIcon className="w-5 h-5" />
                    </button>
                     <Link to={'/containers/' + container.id + '/logs'} className="p-1.5 rounded-lg hover:bg-slate-500/10 text-slate-500 transition-colors" title="Logs">
                        <CommandLineIcon className="w-5 h-5" />
                    </Link>
                    <Link to={'/containers/' + container.id} className="p-1.5 rounded-lg hover:bg-slate-500/10 text-slate-500 transition-colors" title="Details">
                        <DocumentTextIcon className="w-5 h-5" />
                    </Link>
                </div>
             </div>
             
             <div className="p-5 grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">CPU Usage</p>
                    <div className="flex items-end space-x-2">
                        <span className="text-xl font-bold text-slate-700 dark:text-slate-200">{container.cpu_usage}</span>
                         <div className="h-8 w-24">
                           {statsHistory[container.id]?.cpu.length > 0 && (
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={statsHistory[container.id].cpu}>
                                <Area type="monotone" dataKey="value" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.1} strokeWidth={2} isAnimationActive={false} />
                              </AreaChart>
                            </ResponsiveContainer>
                           )}
                        </div>
                    </div>
                </div>
                 <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Memory</p>
                     <div className="flex items-end space-x-2">
                        <span className="text-xl font-bold text-slate-700 dark:text-slate-200">{container.memory_usage}</span>
                        <div className="h-8 w-24">
                           {statsHistory[container.id]?.mem.length > 0 && (
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={statsHistory[container.id].mem}>
                                <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.1} strokeWidth={2} isAnimationActive={false} />
                              </AreaChart>
                            </ResponsiveContainer>
                           )}
                        </div>
                    </div>
                </div>
                 <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Net I/O</p>
                    <p className="text-sm font-mono text-slate-400">Rx/Tx -- / --</p>
                </div>
                 <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Block I/O</p>
                    <p className="text-sm font-mono text-slate-400">{container.disk_io}</p>
                </div>
             </div>
          </GlassCard>
          </motion.div>
        ))}
        {filteredContainers.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500">
                <p>No containers found matching filters.</p>
            </div>
        )}
      </AnimatePresence>
      </div>

      <InspectModal 
        isOpen={inspectModalOpen} 
        onClose={() => setInspectModalOpen(false)} 
        data={inspectData} 
      />

      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({...prev, isOpen: false}))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        isDestructive={confirmModal.isDestructive}
        confirmText={confirmModal.title.split(' ')[0]} // "Remove", "Stop"
      />
    </div>
    </PageTransition>
  );
};
