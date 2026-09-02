import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  BoltIcon, 
  ArrowPathIcon, 
  MagnifyingGlassIcon, 
  FunnelIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  UserIcon,
  CommandLineIcon,
  CpuChipIcon,
  ClockIcon,
  EyeIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import { GlassCard } from './ui/GlassCard';
import { Activity } from '../types/activity';
import clsx from 'clsx';
import { Link } from 'react-router-dom';

interface ActivityTimelineProps {
  agentId?: string;
  targetName?: string;
  compact?: boolean;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  agentId,
  targetName,
  compact = false
}) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(compact ? 15 : 40);
  const [inspectActivity, setInspectActivity] = useState<Activity | null>(null);

  const fetchActivities = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const params: Record<string, any> = {
        page,
        limit,
      };
      if (agentId && agentId !== 'all') params.agent_id = agentId;
      if (targetName) params.target_name = targetName;
      if (selectedSeverity !== 'all') params.severity = selectedSeverity;
      if (selectedType !== 'all') params.type = selectedType;
      if (selectedAction !== 'all') params.action = selectedAction;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const { data } = await api.get<{ activities: Activity[]; total: number }>('/activities', { params });
      setActivities(data?.activities || []);
      setTotal(data?.total || 0);
    } catch (err) {
      console.error('Failed to fetch activities:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [agentId, targetName, selectedSeverity, selectedType, selectedAction, searchQuery, page, limit]);

  useEffect(() => {
    setLoading(true);
    fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchActivities(true);
    }, 6000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchActivities]);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return {
          badge: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/30',
          dot: 'bg-rose-500 animate-ping',
          icon: <XCircleIcon className="w-4 h-4 text-rose-600 dark:text-rose-400" />
        };
      case 'error':
        return {
          badge: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30',
          dot: 'bg-red-500',
          icon: <ExclamationTriangleIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
        };
      case 'warning':
        return {
          badge: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30',
          dot: 'bg-amber-500',
          icon: <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        };
      default:
        return {
          badge: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30',
          dot: 'bg-emerald-500',
          icon: <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        };
    }
  };

  const getActorBadge = (actor: string, actorType: string) => {
    if (actorType === 'user' || actor.startsWith('user:')) {
      const email = actor.replace(/^user:/, '');
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20" title={`User action by ${email}`}>
          <UserIcon className="w-3 h-3 text-purple-500" />
          <span>{email}</span>
        </span>
      );
    }
    if (actor === 'system:oom-killer') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40 animate-pulse" title="Linux Kernel Out of Memory Killer">
          <CpuChipIcon className="w-3 h-3 text-rose-500" />
          <span>Kernel OOM Killer</span>
        </span>
      );
    }
    if (actorType === 'external' || actor.includes('external')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20" title="Triggered outside Conman (Host CLI, Script, Docker Engine, etc.)">
          <CommandLineIcon className="w-3 h-3 text-amber-500" />
          <span>Host CLI / External</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700" title="Docker Engine / Daemon">
        <CpuChipIcon className="w-3 h-3 text-slate-500" />
        <span>Docker Engine</span>
      </span>
    );
  };

  const formatAction = (action: string) => {
    switch (action) {
      case 'oom_killed':
        return <span className="text-rose-600 dark:text-rose-400 font-bold">OOM KILLED</span>;
      case 'crashed':
        return <span className="text-red-600 dark:text-red-400 font-bold">CRASHED</span>;
      case 'stopped':
        return <span className="text-slate-600 dark:text-slate-400 font-medium">STOPPED</span>;
      case 'started':
        return <span className="text-emerald-600 dark:text-emerald-400 font-medium">STARTED</span>;
      case 'restarted':
        return <span className="text-indigo-600 dark:text-indigo-400 font-medium">RESTARTED</span>;
      case 'unhealthy':
        return <span className="text-amber-600 dark:text-amber-400 font-bold">UNHEALTHY</span>;
      case 'healthy':
        return <span className="text-emerald-600 dark:text-emerald-400 font-medium">HEALTHY</span>;
      case 'deleted':
        return <span className="text-rose-600 dark:text-rose-400 font-medium">REMOVED</span>;
      case 'created':
        return <span className="text-blue-600 dark:text-blue-400 font-medium">CREATED</span>;
      default:
        return <span className="uppercase font-medium text-slate-700 dark:text-slate-300">{action}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls & Search */}
      <GlassCard className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Search container, user, crash exit code, details..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Severity Filter */}
            <select
              value={selectedSeverity}
              onChange={(e) => { setSelectedSeverity(e.target.value); setPage(1); }}
              className="text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="all">All Severities</option>
              <option value="critical">🚨 Critical (OOM)</option>
              <option value="error">❌ Errors (Crashes)</option>
              <option value="warning">⚠️ Warnings</option>
              <option value="info">ℹ️ Info</option>
            </select>

            {/* Action Filter */}
            <select
              value={selectedAction}
              onChange={(e) => { setSelectedAction(e.target.value); setPage(1); }}
              className="text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="all">All Actions</option>
              <option value="oom_killed">OOM Killed</option>
              <option value="crashed">Crashed</option>
              <option value="stopped">Stopped</option>
              <option value="started">Started</option>
              <option value="restarted">Restarted</option>
              <option value="unhealthy">Unhealthy</option>
              <option value="deleted">Removed</option>
            </select>

            {/* Auto-Refresh Toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={clsx(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                autoRefresh
                  ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
              )}
              title={autoRefresh ? "Auto-refreshing every 6s" : "Auto-refresh paused"}
            >
              <span className={clsx("w-2 h-2 rounded-full", autoRefresh ? "bg-emerald-500 animate-ping" : "bg-slate-400")} />
              <span>{autoRefresh ? 'Live' : 'Paused'}</span>
            </button>

            {/* Manual Refresh */}
            <button
              onClick={() => fetchActivities(false)}
              disabled={refreshing}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50"
              title="Refresh activity log"
            >
              <ArrowPathIcon className={clsx("w-4 h-4", refreshing && "animate-spin text-indigo-500")} />
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Loading Skeleton */}
      {loading && (
        <GlassCard className="p-8 text-center space-y-4">
          <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500 font-mono animate-pulse">Loading system activity history...</p>
        </GlassCard>
      )}

      {/* Activity Table / List */}
      {!loading && (
        <GlassCard className="p-0 overflow-hidden shadow-xl border border-slate-200 dark:border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-100/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-white/10 uppercase font-semibold tracking-wider text-[11px] sticky top-0">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Severity / Action</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Actor / Initiator</th>
                  <th className="px-4 py-3 min-w-[280px]">Details & Reason</th>
                  <th className="px-4 py-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                {activities.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      No activity records matching filter criteria
                    </td>
                  </tr>
                ) : (
                  activities.map((act) => {
                    const sev = getSeverityBadge(act.severity);
                    const isOom = act.action === 'oom_killed';
                    const isCrash = act.action === 'crashed';

                    return (
                      <tr 
                        key={act.ID}
                        className={clsx(
                          "transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]",
                          isOom && "bg-rose-500/5 hover:bg-rose-500/10",
                          isCrash && "bg-red-500/5 hover:bg-red-500/10"
                        )}
                      >
                        {/* Time */}
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-slate-500">
                          <div className="flex items-center gap-1.5">
                            <ClockIcon className="w-3.5 h-3.5 text-slate-400" />
                            <span title={new Date(act.timestamp).toLocaleString()}>
                              {new Date(act.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {new Date(act.timestamp).toLocaleDateString()}
                          </span>
                        </td>

                        {/* Severity & Action */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1", sev.badge)}>
                              {sev.icon}
                              <span>{formatAction(act.action)}</span>
                            </span>
                          </div>
                        </td>

                        {/* Target Entity */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {act.type === 'container' && (
                              <Link 
                                to={`/containers/${act.target_id || act.target_name}`}
                                className="font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                              >
                                {act.target_name || act.target_id || '<unnamed>'}
                              </Link>
                            )}
                            {act.type === 'image' && (
                              <Link 
                                to={`/images/${encodeURIComponent(act.target_id)}`}
                                className="font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                              >
                                {act.target_name || act.target_id}
                              </Link>
                            )}
                            {act.type !== 'container' && act.type !== 'image' && (
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {act.target_name || act.target_id}
                              </span>
                            )}
                            <span className="text-[10px] uppercase font-mono px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                              {act.type}
                            </span>
                          </div>
                          {act.agent_name && (
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              Host: {act.agent_name}
                            </span>
                          )}
                        </td>

                        {/* Actor / Initiator */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {getActorBadge(act.actor, act.actor_type)}
                        </td>

                        {/* Details & Exit Code */}
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2 flex-wrap">
                            <span className="text-slate-800 dark:text-slate-200 font-medium">
                              {act.details}
                            </span>
                            {act.exit_code && (
                              <span className={clsx(
                                "px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border",
                                act.exit_code === '0' 
                                  ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700" 
                                  : "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-500/30"
                              )}>
                                Exit {act.exit_code}
                              </span>
                            )}
                            {act.reason && (
                              <span className="text-[10px] text-slate-500 italic block">
                                ({act.reason})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Action Column */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => setInspectActivity(act)}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                            title="Inspect event metadata"
                          >
                            <EyeIcon className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Pagination */}
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-white/5 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing <span className="font-semibold text-slate-700 dark:text-slate-300">{activities.length}</span> of{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-300">{total}</span> events
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-mono text-[11px]">Page {page}</span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={activities.length < limit}
                className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Inspect Modal */}
      {inspectActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-scaleUp">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center space-x-2">
                <BoltIcon className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-slate-900 dark:text-white">Activity Event #{inspectActivity.ID}</h3>
              </div>
              <button
                onClick={() => setInspectActivity(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs font-mono max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 text-slate-600 dark:text-slate-400 font-sans">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Action</span>
                  <span className="font-semibold text-slate-900 dark:text-white text-sm">{inspectActivity.action}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Severity</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{inspectActivity.severity}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Target Entity</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{inspectActivity.target_name} ({inspectActivity.type})</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Actor</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{inspectActivity.actor}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[10px] uppercase">Details</span>
                  <span className="text-slate-900 dark:text-white font-medium">{inspectActivity.details}</span>
                </div>
                {inspectActivity.reason && (
                  <div className="col-span-2">
                    <span className="text-slate-400 block text-[10px] uppercase">Reason</span>
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">{inspectActivity.reason}</span>
                  </div>
                )}
              </div>

              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-sans mb-1">Timestamp</span>
                <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/5 text-slate-700 dark:text-slate-300">
                  {new Date(inspectActivity.timestamp).toISOString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
