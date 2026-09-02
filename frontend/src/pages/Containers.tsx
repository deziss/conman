import { isConmanSystemContainer } from '../utils/systemProtection';
import { parseContainerPorts, FormattedPort } from '../utils/ports';
import { useState, useEffect, useMemo } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { 
  PlayIcon, 
  StopIcon, 
  ArrowPathIcon, 
  CpuChipIcon, 
  TrashIcon, 
  EyeIcon, 
  ServerStackIcon, 
  DocumentTextIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  TableCellsIcon,
  ArrowTopRightOnSquareIcon,
  CommandLineIcon
} from '@heroicons/react/24/solid';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { InspectModal } from '../components/InspectModal';
import { useSidebar } from '../layouts/DashboardLayout';
import { useHost } from '../contexts/HostContext';
import { useTask } from '../contexts/TaskContext';
import { PageTransition } from '../components/ui/PageTransition';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { LoadingState } from '../components/ui/LoadingState';
import { SituationalBanner, ActionType } from '../components/ui/SituationalBanner';
import { AnimatePresence, motion } from 'framer-motion';
import { useSettings } from '../contexts/SettingsContext';
import { Pagination } from '../components/ui/Pagination';
import clsx from 'clsx';

interface Container {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  created: number;
  ports: any[];
  ip_address?: string;
  labels?: Record<string, string>;
  cpu_usage: string;
  memory_usage: string;
  disk_io: string;
  network_rx: number;
  network_tx: number;
}

const formatNetBytes = (bytes: number): string => {
  if (!bytes) return '0 B';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

export const Containers = () => {
  const [containers, setContainers] = useState<Container[]>([]);
  const { refreshInterval } = useSettings();
  const [statsHistory, setStatsHistory] = useState<Record<string, { cpu: {value: number}[], mem: {value: number}[] }>>({});
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'running' | 'exited' | 'paused'>('all');
  const [sortOrder, setSortOrder] = useState<'name' | 'status' | 'state'>('state');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() => {
    return (localStorage.getItem('conman_containers_view') as 'table' | 'grid') || 'table';
  });
  const [inspectData, setInspectData] = useState<any>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const { isCollapsed } = useSidebar();
  const { currentHost } = useHost();
  const { startTask } = useTask();

  const handleViewModeChange = (mode: 'table' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('conman_containers_view', mode);
  };

  const [operatingContainers, setOperatingContainers] = useState<Record<string, string>>({});
  const [isPruningContainers, setIsPruningContainers] = useState(false);
  const [activeBanner, setActiveBanner] = useState<{ action: ActionType; title: string; description: string; isVisible: boolean }>({
    action: 'generic',
    title: '',
    description: '',
    isVisible: false
  });

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: async () => {},
    isDestructive: false,
  });

  const fetchContainers = async () => {
    try {
      if (!currentHost) return;
      const endpoint = '/agents/' + currentHost.id + '/containers';
      const { data } = await api.get(endpoint);
      setContainers((data || []).map((c: any) => ({
        ...c,
        name: c.name || (c.names && c.names.length > 0 ? c.names[0].replace(/^\//, '') : 'Unnamed'),
        ports: c.ports || []
      })));

      setStatsHistory(prev => {
        const newHistory = { ...prev };
        (data || []).forEach((c: Container) => {
           const id = c.id;
           if (!newHistory[id]) newHistory[id] = { cpu: [], mem: [] };
           
           const cpuVal = c.cpu_usage ? parseFloat(c.cpu_usage.replace('%', '')) : 0;
           let memVal = 0;
           if (c.memory_usage) {
               memVal = parseFloat(c.memory_usage);
               if (c.memory_usage.includes('GB')) memVal *= 1024;
           }

           const maxPoints = 20;
           const newCpu = [...(newHistory[c.id]?.cpu || []), { value: cpuVal }].slice(-maxPoints);
           const newMem = [...(newHistory[c.id]?.mem || []), { value: memVal }].slice(-maxPoints);
           
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
  }, [currentHost, refreshInterval]);

  const executeAction = async (id: string, action: 'start' | 'stop' | 'restart' | 'remove') => {
      if (!currentHost) return;
      
      let endpoint = '/agents/' + currentHost.id + '/containers/' + id;
      if (action !== 'remove') endpoint += '/' + action;
      
      const method: 'post' | 'delete' = action === 'remove' ? 'delete' : 'post';
      const actionName = `${action.charAt(0).toUpperCase() + action.slice(1)}ing`;
      const targetCont = containers.find(c => c.id === id);
      const contName = targetCont?.name || id.substring(0, 12);
      
      setOperatingContainers(prev => ({ ...prev, [id]: actionName }));
      setActiveBanner({
        action: action === 'remove' ? 'deleting' : 'restarting',
        title: `${actionName} Container`,
        description: `Sending docker ${action} signal to container ${contName}...`,
        isVisible: true
      });

      const task = startTask({
        type: action === 'remove' ? 'remove' : action,
        title: `${action.charAt(0).toUpperCase() + action.slice(1)} Container`,
        resource: contName,
        initialLog: `Dispatching ${action} command to Docker engine for ${contName}...`
      });

      try {
          task.setProgress(40);
          task.appendLog(`Waiting for container lifecycle transition on host ${currentHost.name}...`);
          
          await api[method](endpoint);
          
          task.appendLog(`Container ${contName} state updated.`);
          task.complete(`Container ${contName} ${action}ed successfully`);
          toast.success(`Container ${action}ed successfully`);
          fetchContainers();
      } catch (e: any) {
          const errMsg = e.response?.data?.error || e.message || `Failed to ${action} container`;
          task.fail(errMsg);
          toast.error(errMsg);
      } finally {
          setOperatingContainers(prev => {
              const next = { ...prev };
              delete next[id];
              return next;
          });
          setTimeout(() => {
              setActiveBanner(prev => ({ ...prev, isVisible: false }));
          }, 800);
      }
  };

  const handlePrune = async () => {
      if (!currentHost) return;
      setIsPruningContainers(true);
      const task = startTask({
          type: 'prune',
          title: 'Pruning Containers',
          resource: 'Stopped / exited containers',
          initialLog: 'Sending container prune request to Docker host...'
      });

      try {
          task.setProgress(40);
          const { data } = await api.post(`/agents/${currentHost.id}/containers/prune`);
          const count = data?.containers_deleted?.length || 0;
          task.appendLog(`Docker pruned ${count} stopped containers.`);
          task.complete(`Pruned ${count} stopped containers`);
          toast.success(`Pruned ${count} stopped containers`);
          fetchContainers();
      } catch (err: any) {
          const errMsg = err.response?.data?.error || err.message || 'Failed to prune containers';
          task.fail(errMsg);
          toast.error(errMsg);
      } finally {
          setIsPruningContainers(false);
      }
  };

  const handleActionClick = (id: string, action: 'start' | 'stop' | 'restart' | 'remove') => {
      const targetCont = containers.find(c => c.id === id);
      if (targetCont && isConmanSystemContainer(targetCont.name, targetCont.image)) {
          if (action === 'remove') {
              toast.error('Cannot remove Conman core system container from within the panel.');
              return;
          }
          if (action === 'stop') {
              toast.error('Cannot stop Conman core system container from within the panel.');
              return;
          }
      }
      if (action === 'remove' || action === 'stop') {
          setConfirmModal({
              isOpen: true,
              title: `${action.charAt(0).toUpperCase() + action.slice(1)} Container`,
              message: `Are you sure you want to ${action} this container? This action cannot be undone.`,
              isDestructive: true,
              onConfirm: async () => {
                  setConfirmModal(prev => ({ ...prev, isOpen: false }));
                  executeAction(id, action);
              }
          });
      } else {
          executeAction(id, action);
      }
  };

  const handleInspect = async (id: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
          if (!currentHost) return;
          const endpoint = `/agents/${currentHost.id}/containers/${id}`;
          const { data } = await api.get(endpoint);
          setInspectData(data);
          setInspectModalOpen(true);
      } catch (error) {
          toast.error("Failed to inspect container");
      }
  };

  const getStatusColor = (state: string) => {
      switch(state) {
          case 'running': return 'bg-emerald-500 shadow-emerald-500/50';
          case 'exited': return 'bg-rose-500 shadow-rose-500/50';
          case 'paused': return 'bg-amber-500 shadow-amber-500/50';
          default: return 'bg-slate-500 shadow-slate-500/50';
      }
  };

  const filteredContainers = useMemo(() => {
    let list = containers;

    if (filterStatus !== 'all') {
      list = list.filter(c => c.state === filterStatus);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      list = list.filter(c => 
        c.name.toLowerCase().includes(query) ||
        c.image.toLowerCase().includes(query) ||
        (c.ip_address && c.ip_address.includes(query)) ||
        (c.labels?.['com.docker.compose.project'] && c.labels['com.docker.compose.project'].toLowerCase().includes(query))
      );
    }

    return [...list].sort((a, b) => {
      if (sortOrder === 'name') return a.name.localeCompare(b.name);
      if (sortOrder === 'status') return a.status.localeCompare(b.status);
      if (sortOrder === 'state') {
          if (a.state === 'running' && b.state !== 'running') return -1;
          if (a.state !== 'running' && b.state === 'running') return 1;
          return 0;
      }
      return 0;
    });
  }, [containers, filterStatus, searchQuery, sortOrder]);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const paginatedContainers = filteredContainers.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [sortOrder, filterStatus, searchQuery]);

  return (
    <PageTransition>
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
              <span>Containers</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20">
                {containers.length}
              </span>
           </h1>
           <p className="text-sm text-slate-500 mt-1">Manage and inspect lifecycle of container workloads across hosts</p>
        </div>
        
        {/* Actions & View Controls */}
        <div className="flex flex-wrap items-center gap-3">
             {/* Host Badge */}
             {currentHost && (
                <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium">
                    <ServerStackIcon className="w-4 h-4 text-cyan-500" />
                    <span>{currentHost.name}</span>
                </div>
            )}

            {/* View Mode Toggle (Dockhand style) */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => handleViewModeChange('table')}
                className={clsx(
                  "p-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
                  viewMode === 'table'
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                )}
                title="List / Table View"
              >
                <TableCellsIcon className="w-4 h-4" />
                <span className="hidden sm:inline">List</span>
              </button>
              <button
                onClick={() => handleViewModeChange('grid')}
                className={clsx(
                  "p-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
                  viewMode === 'grid'
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                )}
                title="Cards / Grid View"
              >
                <Squares2X2Icon className="w-4 h-4" />
                <span className="hidden sm:inline">Grid</span>
              </button>
            </div>

            {/* Prune */}
            <button 
                onClick={handlePrune}
                className="flex items-center space-x-1.5 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                title="Prune stopped containers"
            >
                <TrashIcon className="w-4 h-4" />
                <span>Prune</span>
            </button>

            {/* Refresh */}
            <button 
                onClick={fetchContainers}
                className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                title="Refresh containers list"
            >
                <ArrowPathIcon className={clsx("w-4 h-4", loading && "animate-spin text-cyan-500")} />
                <span>Refresh</span>
            </button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <GlassCard className="p-3 flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
              <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search containers, image, IP, stack..."
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
              {/* Status Filter */}
              <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                  {(['all', 'running', 'exited', 'paused'] as const).map((status) => (
                      <button
                          key={status}
                          onClick={() => setFilterStatus(status)}
                          className={clsx(
                              "px-2.5 py-1 rounded-md font-medium capitalize transition-all",
                              filterStatus === status 
                                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" 
                                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                          )}
                      >
                          {status}
                      </button>
                  ))}
              </div>

              {/* Sort Order */}
              <select 
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              >
                  <option value="state">Sort by State</option>
                  <option value="name">Sort by Name</option>
                  <option value="status">Sort by Status</option>
              </select>
          </div>
      </GlassCard>

      {/* Loading Skeleton */}
      {loading && containers.length === 0 && (
          <LoadingState type="containers" viewMode={viewMode} count={viewMode === 'grid' ? 8 : 6} />
      )}

      {/* --- TABLE / LIST VIEW (Dockhand Style) --- */}
      {!loading && viewMode === 'table' && (
        <GlassCard className="p-0 overflow-hidden shadow-xl border border-slate-200 dark:border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-100/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-white/10 uppercase font-semibold tracking-wider text-[11px] sticky top-0 backdrop-blur-sm z-10">
                <tr>
                  <th className="px-4 py-3 min-w-[200px]">Name</th>
                  <th className="px-4 py-3 min-w-[160px]">Image</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3 min-w-[110px]">Uptime</th>
                  <th className="px-4 py-3">CPU</th>
                  <th className="px-4 py-3">Memory</th>
                  <th className="px-4 py-3">Net I/O</th>
                  <th className="px-4 py-3">Disk I/O</th>
                  <th className="px-4 py-3">IP Address</th>
                  <th className="px-4 py-3 min-w-[140px]">Ports</th>
                  <th className="px-4 py-3">Stack</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5 font-sans">
                {filteredContainers.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-12 text-center text-slate-500">
                      No containers matching filters found.
                    </td>
                  </tr>
                ) : (
                  paginatedContainers.map((container) => {
                    const isSystem = isConmanSystemContainer(container.name, container.image);
                    const isRunning = container.state === 'running';
                    const parsedPorts = parseContainerPorts(container.ports, currentHost);
                    const stackName = container.labels?.['com.docker.compose.project'] || container.labels?.['com.docker.stack.namespace'] || '';

                    return (
                      <tr 
                        key={container.id}
                        className={clsx(
                          "transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03] group",
                          isSystem && "bg-cyan-500/[0.02]"
                        )}
                      >
                        {/* Name */}
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <span className={clsx("w-2.5 h-2.5 rounded-full shrink-0", getStatusColor(container.state))} />
                            <div className="min-w-0">
                              <Link 
                                to={`/containers/${container.id}`}
                                className="font-semibold text-slate-900 dark:text-slate-100 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors block truncate max-w-[190px]" 
                                title={container.name}
                              >
                                {container.name}
                              </Link>
                              {isSystem && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 mt-0.5" title="Protected System Container">
                                  <ShieldCheckIcon className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                                  System
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Image */}
                        <td className="px-4 py-3 align-middle font-mono text-xs">
                          <span 
                            className="text-slate-700 dark:text-slate-300 truncate block max-w-[150px]" 
                            title={container.image}
                          >
                            {container.image}
                          </span>
                        </td>

                        {/* State */}
                        <td className="px-4 py-3 align-middle whitespace-nowrap">
                          <span className={clsx(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border",
                            isRunning 
                              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                              : container.state === 'exited'
                                ? "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                          )}>
                            <span>{isRunning ? '▷' : '▢'}</span>
                            <span className="capitalize">{container.state}</span>
                          </span>
                        </td>

                        {/* Uptime / Status */}
                        <td className="px-4 py-3 align-middle whitespace-nowrap text-slate-500 text-[11px]">
                          {container.status}
                        </td>

                        {/* CPU */}
                        <td className="px-4 py-3 align-middle font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {container.cpu_usage || '0.00%'}
                        </td>

                        {/* Memory */}
                        <td className="px-4 py-3 align-middle font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {container.memory_usage || '0 B'}
                        </td>

                        {/* Net I/O */}
                        <td className="px-4 py-3 align-middle font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap" title={`${formatNetBytes(container.network_rx)} received / ${formatNetBytes(container.network_tx)} sent`}>
                          ↓{formatNetBytes(container.network_rx)} ↑{formatNetBytes(container.network_tx)}
                        </td>

                        {/* Disk I/O */}
                        <td className="px-4 py-3 align-middle font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {container.disk_io || '0 B / 0 B'}
                        </td>

                        {/* IP Address */}
                        <td className="px-4 py-3 align-middle font-mono text-xs whitespace-nowrap">
                          {container.ip_address ? (
                            <span className="text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-200 dark:border-cyan-500/20">
                              {container.ip_address}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Ports with Clickable External Link */}
                        <td className="px-4 py-3 align-middle whitespace-nowrap">
                          {parsedPorts.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1 max-w-[200px]">
                              {parsedPorts.map((port, pIdx) => (
                                port.url ? (
                                  <a
                                    key={pIdx}
                                    href={port.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 hover:underline transition-colors"
                                    title={`Open http://${window.location.hostname}:${port.publicPort} in new tab`}
                                  >
                                    <span>{port.display}</span>
                                    <ArrowTopRightOnSquareIcon className="w-3 h-3 text-indigo-500" />
                                  </a>
                                ) : (
                                  <span
                                    key={pIdx}
                                    className="inline-block px-1.5 py-0.5 rounded text-[11px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                                  >
                                    {port.display}
                                  </span>
                                )
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Stack */}
                        <td className="px-4 py-3 align-middle font-mono text-xs whitespace-nowrap">
                          {stackName ? (
                            <span className="text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-500/20">
                              {stackName}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 align-middle text-right whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-1 opacity-90 group-hover:opacity-100">
                            {/* Start/Stop */}
                            <button 
                              onClick={() => handleActionClick(container.id, isRunning ? 'stop' : 'start')}
                              disabled={isRunning && isSystem}
                              className={clsx(
                                "p-1.5 rounded-lg transition-colors",
                                isRunning && isSystem
                                  ? "opacity-20 cursor-not-allowed text-slate-400"
                                  : isRunning 
                                    ? "hover:bg-amber-500/10 text-amber-500" 
                                    : "hover:bg-emerald-500/10 text-emerald-500"
                              )}
                              title={isRunning && isSystem ? "Protected: Conman core system container cannot be stopped from itself" : isRunning ? 'Stop Container' : 'Start Container'}
                            >
                              {isRunning ? <StopIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
                            </button>

                            {/* Restart */}
                            <button
                              onClick={() => handleActionClick(container.id, 'restart')}
                              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-cyan-500 transition-colors"
                              title="Restart Container"
                            >
                              <ArrowPathIcon className="w-4 h-4" />
                            </button>

                            {/* Terminal / Exec */}
                            <Link
                              to={`/containers/${container.id}`}
                              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-indigo-500 transition-colors"
                              title="Open Terminal / Shell"
                            >
                              <CommandLineIcon className="w-4 h-4" />
                            </Link>

                            {/* Logs */}
                            <Link 
                              to={`/containers/${container.id}/logs`} 
                              className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" 
                              title="View Logs"
                            >
                              <DocumentTextIcon className="w-4 h-4" />
                            </Link>

                            {/* Inspect */}
                            <button 
                              onClick={(e) => handleInspect(container.id, e)}
                              className="p-1.5 rounded-lg hover:bg-cyan-500/10 text-slate-400 hover:text-cyan-500 transition-colors"
                              title="Inspect JSON"
                            >
                              <EyeIcon className="w-4 h-4" />
                            </button>

                            {/* Remove (System Protected) */}
                            <button 
                              onClick={() => handleActionClick(container.id, 'remove')}
                              disabled={isSystem}
                              className={clsx(
                                "p-1.5 rounded-lg transition-colors",
                                isSystem
                                  ? "opacity-20 cursor-not-allowed text-slate-400"
                                  : "hover:bg-rose-500/10 text-slate-400 hover:text-rose-500"
                              )}
                              title={isSystem ? "Protected: Conman core system container cannot be removed from itself" : "Remove Container"}
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* --- GRID / CARDS VIEW --- */}
      {!loading && viewMode === 'grid' && (
        <div className={`grid gap-6 items-stretch ${isCollapsed ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
        <AnimatePresence mode="popLayout">
          {paginatedContainers.map((container) => {
            const isSystem = isConmanSystemContainer(container.name, container.image);
            const isRunning = container.state === 'running';
            const parsedPorts = parseContainerPorts(container.ports, currentHost);
            const hasNetworkInfo = container.ip_address || parsedPorts.length > 0;

            return (
              <motion.div
                key={container.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                layout
                className="h-full flex flex-col"
              >
              <GlassCard className="p-0 overflow-hidden hover:ring-1 hover:ring-cyan-500/30 transition-all duration-300 group h-full flex flex-col justify-between">
                <div>
                  {/* Standardized Header Slot */}
                  <div className="p-4 border-b border-slate-200 dark:border-slate-700/50 flex justify-between items-start bg-slate-50/30 dark:bg-slate-800/30 min-h-[82px]">
                      <div className="flex items-start space-x-2.5 min-w-0 flex-1">
                          <div className={`w-3 h-3 mt-1.5 rounded-full ${getStatusColor(container.state)} transition-all duration-500 flex-shrink-0`}></div>
                          <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                  <Link to={'/containers/' + container.id} className="min-w-0">
                                      <h3 className="font-semibold text-base text-slate-800 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors cursor-pointer truncate max-w-[160px] sm:max-w-[190px]" title={container.name}>
                                          {container.name}
                                      </h3>
                                  </Link>
                                  {isSystem && (
                                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 flex items-center gap-0.5 shrink-0" title="Protected: Conman System Container">
                                          <ShieldCheckIcon className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                                          System
                                      </span>
                                  )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  <p className="text-[11px] font-mono text-slate-500 bg-slate-200/80 dark:bg-slate-700/60 px-1.5 py-0.5 rounded truncate max-w-[140px]" title={container.image}>{container.image}</p>
                                  <p className="text-[11px] text-slate-400 truncate max-w-[120px]" title={container.status}>{container.status}</p>
                              </div>
                          </div>
                      </div>

                      {/* Header Actions */}
                      <div className="flex space-x-1 opacity-80 flex-shrink-0 ml-2">
                        <button 
                              onClick={() => handleActionClick(container.id, isRunning ? 'stop' : 'start')}
                              disabled={isRunning && isSystem}
                              className={clsx(
                                  "p-1.5 rounded-lg transition-colors",
                                  isRunning && isSystem
                                      ? "opacity-20 cursor-not-allowed text-slate-400"
                                      : isRunning
                                          ? "hover:bg-amber-500/10 text-amber-500"
                                          : "hover:bg-emerald-500/10 text-emerald-500"
                              )}
                              title={isRunning && isSystem ? "Protected: Conman core system container cannot be stopped from itself" : isRunning ? 'Stop' : 'Start'}
                          >
                              {isRunning ? <StopIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
                          </button>
                          <button 
                              onClick={() => handleActionClick(container.id, 'remove')}
                              disabled={isSystem}
                              className={clsx(
                                  "p-1.5 rounded-lg transition-colors",
                                  isSystem
                                      ? "opacity-25 cursor-not-allowed text-slate-400"
                                      : "hover:bg-red-500/10 text-red-500"
                              )}
                              title={isSystem ? "Protected: Conman core system container cannot be removed from itself" : "Remove"}
                          >
                              <TrashIcon className="w-4 h-4" />
                          </button>
                          <button 
                              onClick={(e) => handleInspect(container.id, e)}
                              className="p-1.5 rounded-lg hover:bg-cyan-500/10 text-cyan-500 transition-colors"
                              title="Inspect"
                          >
                              <EyeIcon className="w-4 h-4" />
                          </button>

                          <Link to={'/containers/' + container.id} className="p-1.5 rounded-lg hover:bg-slate-500/10 text-slate-500 transition-colors" title="Details">
                              <DocumentTextIcon className="w-4 h-4" />
                          </Link>
                      </div>
                  </div>

                  {/* Standardized IP & Ports Slot (Consistent Height Across All Cards) */}
                  <div className="px-4 py-2 bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700/50 flex flex-wrap items-center justify-between gap-2 text-xs min-h-[38px]">
                    {container.ip_address ? (
                      <div className="flex items-center gap-1 font-mono text-[11px]">
                        <span className="text-slate-400">IP:</span>
                        <span className="text-cyan-700 dark:text-cyan-400 font-semibold">{container.ip_address}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                        <span>IP:</span>
                        <span className="text-slate-400 italic">None</span>
                      </div>
                    )}

                    {parsedPorts.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {parsedPorts.map((port, pIdx) => (
                          port.url ? (
                            <a
                              key={pIdx}
                              href={port.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 hover:underline"
                              title={`Open ${port.url}`}
                            >
                              <span>{port.display}</span>
                              <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span key={pIdx} className="text-[10px] font-mono text-slate-500 bg-slate-200/60 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                              {port.display}
                            </span>
                          )
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-400 italic">No exposed ports</span>
                    )}
                  </div>
                </div>
                
                {/* Standardized Metrics & Stats Footer */}
                <div className="p-4 grid grid-cols-2 gap-4 flex-1 flex flex-col justify-between">
                    <div className="space-y-1">
                        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">CPU Usage</p>
                        <div className="flex items-end space-x-2">
                            <span className="text-lg font-bold text-slate-700 dark:text-slate-200">{container.cpu_usage || '0.00%'}</span>
                            <div className="h-6 w-20">
                              {statsHistory[container.id]?.cpu?.length > 0 && (
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
                        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Memory</p>
                        <div className="flex items-end space-x-2">
                            <span className="text-lg font-bold text-slate-700 dark:text-slate-200">{container.memory_usage || '0 B'}</span>
                            <div className="h-6 w-20">
                              {statsHistory[container.id]?.mem?.length > 0 && (
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={statsHistory[container.id].mem}>
                                    <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.1} strokeWidth={2} isAnimationActive={false} />
                                  </AreaChart>
                                </ResponsiveContainer>
                              )}
                            </div>
                        </div>
                    </div>
                    <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800/60 mt-auto">
                        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Net I/O</p>
                        <p className="text-xs font-mono text-slate-400">↓{formatNetBytes(container.network_rx)} ↑{formatNetBytes(container.network_tx)}</p>
                    </div>
                    <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800/60 mt-auto">
                        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Block I/O</p>
                        <p className="text-xs font-mono text-slate-400">{container.disk_io || '0 B / 0 B'}</p>
                    </div>
                </div>
              </GlassCard>
              </motion.div>
            );
          })}
          {filteredContainers.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500">
                  <p>No containers found matching filters.</p>
              </div>
          )}
        </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      <Pagination
        currentPage={page}
        totalItems={filteredContainers.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
      />

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
        confirmText={confirmModal.title.split(' ')[0]}
      />
    </div>
    </PageTransition>
  );
};
