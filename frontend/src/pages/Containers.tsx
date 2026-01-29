import { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { PlayIcon, StopIcon, ArrowPathIcon, CpuChipIcon, TrashIcon, EyeIcon } from '@heroicons/react/24/solid';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { InspectModal } from '../components/InspectModal';

interface Container {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
}

export const Containers = () => {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'running' | 'exited' | 'paused'>('all');
  const [sortOrder, setSortOrder] = useState<'name' | 'status' | 'state'>('state');
  const [inspectData, setInspectData] = useState<any>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);

  const fetchContainers = async () => {
    try {
      const { data } = await api.get('/containers');
      setContainers(data);
    } catch (error) {
      console.error("Failed to fetch containers", error);
    } finally {
      setLoading(false);
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
             await api.delete(`/containers/${id}`);
        } else {
             await api.post(`/containers/${id}/${action}`);
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
          const { data } = await api.get(`/containers/${id}`);
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              </div>
              <div className="p-2 glass rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={fetchContainers}>
                <ArrowPathIcon className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
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
