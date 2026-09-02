import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  CommandLineIcon, 
  ArrowPathIcon, 
  MagnifyingGlassIcon, 
  PlayIcon, 
  ClipboardDocumentIcon, 
  CheckIcon,
  FunnelIcon,
  UserIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import { GlassCard } from './ui/GlassCard';
import clsx from 'clsx';
import toast from 'react-hot-toast';

interface ContainerProcessesProps {
  containerId: string;
  agentId?: string;
  containerState?: string;
  onStartContainer?: () => void;
}

interface TopResponse {
  Titles: string[];
  Processes: string[][];
}

const PS_PRESETS = [
  { label: 'Standard (-ef)', value: '-ef' },
  { label: 'BSD style (aux)', value: 'aux' },
  { label: 'Detailed (-eo pid,user,pcpu,pmem,args)', value: '-eo pid,user,pcpu,pmem,args' },
];

export const ContainerProcesses = ({
  containerId,
  agentId,
  containerState,
  onStartContainer
}: ContainerProcessesProps) => {
  const [titles, setTitles] = useState<string[]>([]);
  const [processes, setProcesses] = useState<string[][]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [psArgs, setPsArgs] = useState('-ef');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval] = useState(5000);
  const [copiedPid, setCopiedPid] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const fetchProcesses = useCallback(async (isSilent = false) => {
    if (!agentId || !containerId) return;
    if (!isSilent) setRefreshing(true);
    setError(null);

    try {
      const { data } = await api.get<TopResponse>(
        `/agents/${agentId}/containers/${encodeURIComponent(containerId)}/top`,
        { params: { ps_args: psArgs } }
      );

      setTitles(data?.Titles || []);
      setProcesses(data?.Processes || []);
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.response?.data || err.message || 'Failed to fetch processes';
      setError(typeof errMsg === 'object' ? JSON.stringify(errMsg) : String(errMsg));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [agentId, containerId, psArgs]);

  // Initial load and reload on psArgs change
  useEffect(() => {
    setLoading(true);
    fetchProcesses();
  }, [fetchProcesses]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh || containerState === 'exited' || containerState === 'stopped') return;

    const interval = setInterval(() => {
      fetchProcesses(true);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchProcesses, containerState]);

  const handleCopyCommand = (cmd: string, pid: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedPid(pid);
    toast.success('Command copied to clipboard');
    setTimeout(() => setCopiedPid(null), 2000);
  };

  // Identify column indices for smart display
  const colIndices = useMemo(() => {
    const map: Record<string, number> = {};
    titles.forEach((t, i) => {
      const upper = t.toUpperCase();
      if (upper === 'UID' || upper === 'USER') map.user = i;
      else if (upper === 'PID') map.pid = i;
      else if (upper === 'PPID') map.ppid = i;
      else if (upper === 'C' || upper === '%CPU') map.cpu = i;
      else if (upper === '%MEM') map.mem = i;
      else if (upper === 'TIME') map.time = i;
      else if (upper === 'STIME' || upper === 'START') map.stime = i;
      else if (upper === 'CMD' || upper === 'COMMAND') map.cmd = i;
    });
    return map;
  }, [titles]);

  // Filtered and sorted processes
  const filteredProcesses = useMemo(() => {
    let list = processes;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      list = list.filter(row => row.some(cell => cell.toLowerCase().includes(query)));
    }

    if (sortColumn !== null && sortColumn < titles.length) {
      list = [...list].sort((a, b) => {
        const valA = a[sortColumn] || '';
        const valB = b[sortColumn] || '';
        const numA = parseFloat(valA);
        const numB = parseFloat(valB);

        if (!isNaN(numA) && !isNaN(numB)) {
          return sortAsc ? numA - numB : numB - numA;
        }
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
    }

    return list;
  }, [processes, searchQuery, sortColumn, sortAsc, titles.length]);

  // Unique users
  const uniqueUsers = useMemo(() => {
    if (colIndices.user === undefined) return 0;
    const users = new Set(processes.map(p => p[colIndices.user]));
    return users.size;
  }, [processes, colIndices.user]);

  const handleSort = (index: number) => {
    if (sortColumn === index) {
      setSortAsc(!sortAsc);
    } else {
      setSortColumn(index);
      setSortAsc(true);
    }
  };

  if (containerState === 'exited' || containerState === 'stopped') {
    return (
      <GlassCard className="p-12 text-center flex flex-col items-center justify-center min-h-[350px]">
        <div className="p-4 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-400 mb-4">
          <CommandLineIcon className="w-10 h-10" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Container is not running</h3>
        <p className="text-sm text-slate-500 max-w-md mb-6">
          Processes are only available while the container is actively running. Start the container to inspect live processes.
        </p>
        {onStartContainer && (
          <button
            onClick={onStartContainer}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-500/25 transition-all"
          >
            <PlayIcon className="w-5 h-5" />
            Start Container
          </button>
        )}
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Controls Card */}
      <GlassCard className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Header & Stats */}
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-600 dark:text-indigo-400">
              <CommandLineIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Running Processes</h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                  {processes.length} {processes.length === 1 ? 'Process' : 'Processes'}
                </span>
                {uniqueUsers > 0 && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    <UserIcon className="w-3 h-3" />
                    {uniqueUsers} {uniqueUsers === 1 ? 'User' : 'Users'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Live process tree inspection inside container namespace</p>
            </div>
          </div>

          {/* Action Tools */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Filter */}
            <div className="relative flex-1 sm:w-64">
              <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter PID, user, cmd..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>

            {/* PS Arguments Preset */}
            <div className="flex items-center gap-1.5">
              <FunnelIcon className="w-4 h-4 text-slate-400 hidden sm:block" />
              <select
                value={psArgs}
                onChange={(e) => setPsArgs(e.target.value)}
                className="text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                title="Process arguments"
              >
                {PS_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Auto-Refresh Toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={clsx(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                autoRefresh
                  ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
              )}
              title={autoRefresh ? "Auto-refreshing every 5s" : "Auto-refresh paused"}
            >
              <span className={clsx("w-2 h-2 rounded-full", autoRefresh ? "bg-emerald-500 animate-ping" : "bg-slate-400")} />
              <span>{autoRefresh ? 'Live' : 'Paused'}</span>
            </button>

            {/* Manual Refresh */}
            <button
              onClick={() => fetchProcesses(false)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50"
              title="Refresh processes"
            >
              <ArrowPathIcon className={clsx("w-3.5 h-3.5", refreshing && "animate-spin text-indigo-500")} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm flex items-center justify-between">
          <span>Failed to inspect processes: {error}</span>
          <button
            onClick={() => fetchProcesses(false)}
            className="text-xs font-semibold underline hover:no-underline ml-4"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !error && (
        <GlassCard className="p-8 text-center space-y-4">
          <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500 font-mono animate-pulse">Inspecting container processes...</p>
        </GlassCard>
      )}

      {/* Processes Table */}
      {!loading && !error && (
        <GlassCard className="p-0 overflow-hidden shadow-xl border border-slate-200 dark:border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-100/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-white/10 backdrop-blur-sm sticky top-0 uppercase font-semibold tracking-wider text-[11px]">
                <tr>
                  {titles.map((title, idx) => (
                    <th
                      key={idx}
                      onClick={() => handleSort(idx)}
                      className={clsx(
                        "px-4 py-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-white/5 transition-colors select-none",
                        idx === colIndices.cmd ? "min-w-[300px]" : "whitespace-nowrap"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{title}</span>
                        {sortColumn === idx && (
                          <span className="text-indigo-500 font-bold">{sortAsc ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 dark:divide-white/5 font-mono">
                {filteredProcesses.length === 0 ? (
                  <tr>
                    <td colSpan={titles.length + 1} className="px-6 py-12 text-center text-slate-500">
                      {searchQuery ? `No processes matching "${searchQuery}"` : 'No running processes found in container'}
                    </td>
                  </tr>
                ) : (
                  filteredProcesses.map((proc, rowIdx) => {
                    const pid = colIndices.pid !== undefined ? proc[colIndices.pid] : String(rowIdx);
                    const isPidOne = pid === '1';
                    const cmd = colIndices.cmd !== undefined ? proc[colIndices.cmd] : proc[proc.length - 1] || '';
                    const user = colIndices.user !== undefined ? proc[colIndices.user] : '';
                    const isRoot = user === 'root' || user === '0';

                    return (
                      <tr 
                        key={rowIdx}
                        className={clsx(
                          "transition-colors group",
                          isPidOne 
                            ? "bg-indigo-500/5 hover:bg-indigo-500/10" 
                            : "hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                        )}
                      >
                        {proc.map((val, cellIdx) => {
                          const isCmd = cellIdx === colIndices.cmd;
                          const isPid = cellIdx === colIndices.pid;
                          const isUser = cellIdx === colIndices.user;

                          return (
                            <td 
                              key={cellIdx} 
                              className={clsx(
                                "px-4 py-3 align-middle",
                                isCmd ? "font-mono text-slate-900 dark:text-slate-100 max-w-xl" : "whitespace-nowrap"
                              )}
                            >
                              {isPid && (
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900 dark:text-white">{val}</span>
                                  {isPidOne && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30">
                                      init (PID 1)
                                    </span>
                                  )}
                                </div>
                              )}

                              {isUser && (
                                <span className={clsx(
                                  "px-2 py-0.5 rounded text-[11px] font-sans font-medium border",
                                  isRoot 
                                    ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20" 
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                                )}>
                                  {val}
                                </span>
                              )}

                              {isCmd && (
                                <div className="flex items-center justify-between gap-3 group/cmd">
                                  <span className="truncate block font-mono text-xs text-slate-800 dark:text-slate-200" title={val}>
                                    {val}
                                  </span>
                                </div>
                              )}

                              {!isPid && !isUser && !isCmd && (
                                <span className="text-slate-600 dark:text-slate-400">{val || '-'}</span>
                              )}
                            </td>
                          );
                        })}

                        {/* Action Column */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleCopyCommand(cmd, pid)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                            title="Copy command line"
                          >
                            {copiedPid === pid ? (
                              <CheckIcon className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <ClipboardDocumentIcon className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer Stats */}
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
            <div>
              Showing <span className="font-semibold text-slate-700 dark:text-slate-300">{filteredProcesses.length}</span> of{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-300">{processes.length}</span> total processes
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span>PS Args: <strong className="text-indigo-600 dark:text-indigo-400">{psArgs}</strong></span>
              <span>•</span>
              <span>Refreshed: {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
};
