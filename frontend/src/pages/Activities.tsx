import React, { useState, useEffect } from 'react';
import { 
  BoltIcon, 
  CpuChipIcon, 
  ExclamationTriangleIcon, 
  UserIcon, 
  ServerStackIcon 
} from '@heroicons/react/24/outline';
import api from '../services/api';
import { GlassCard } from '../components/ui/GlassCard';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { useHost } from '../contexts/HostContext';
import { ActivityStats } from '../types/activity';

export const Activities = () => {
  const { currentHost, hosts } = useHost();
  const [selectedHostId, setSelectedHostId] = useState<string>('all');
  const [stats, setStats] = useState<ActivityStats>({
    total_24h: 0,
    oom_kills: 0,
    crashes: 0,
    user_actions: 0
  });

  useEffect(() => {
    if (currentHost) {
      setSelectedHostId(currentHost.id);
    }
  }, [currentHost]);

  const fetchStats = async () => {
    try {
      const params: Record<string, any> = {};
      if (selectedHostId !== 'all') {
        params.agent_id = selectedHostId;
      }
      const { data } = await api.get<ActivityStats>('/activities/stats', { params });
      if (data) setStats(data);
    } catch (err) {
      console.error('Failed to fetch activity stats:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [selectedHostId]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-amber-500 to-rose-500 rounded-xl text-white shadow-lg shadow-amber-500/20">
              <BoltIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                System Activity & Audit Log
              </h1>
              <p className="text-xs text-slate-500">
                Live full-system event tracking: container crashes, OOM killer terminations, host CLI changes, and user audits
              </p>
            </div>
          </div>
        </div>

        {/* Host Filter */}
        <div className="flex items-center gap-2">
          <ServerStackIcon className="w-4 h-4 text-slate-400" />
          <select
            value={selectedHostId}
            onChange={(e) => setSelectedHostId(e.target.value)}
            className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          >
            <option value="all">All Hosts / Agents ({hosts.length})</option>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Events */}
        <GlassCard className="p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Events (24h)</span>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {stats.total_24h.toLocaleString()}
            </div>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-200 dark:border-blue-500/20">
            <BoltIcon className="w-5 h-5" />
          </div>
        </GlassCard>

        {/* OOM Kills */}
        <GlassCard className="p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">OOM Killed (24h)</span>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-2">
              <span>{stats.oom_kills}</span>
              {stats.oom_kills > 0 && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-300">
                  Critical
                </span>
              )}
            </div>
          </div>
          <div className="p-3 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-200 dark:border-rose-500/20">
            <CpuChipIcon className="w-5 h-5" />
          </div>
        </GlassCard>

        {/* Crashes */}
        <GlassCard className="p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Container Crashes</span>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              {stats.crashes}
            </div>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-200 dark:border-amber-500/20">
            <ExclamationTriangleIcon className="w-5 h-5" />
          </div>
        </GlassCard>

        {/* User Actions */}
        <GlassCard className="p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">User UI Actions</span>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
              {stats.user_actions}
            </div>
          </div>
          <div className="p-3 bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl border border-purple-200 dark:border-purple-500/20">
            <UserIcon className="w-5 h-5" />
          </div>
        </GlassCard>
      </div>

      {/* Main Activity Timeline Feed */}
      <ActivityTimeline agentId={selectedHostId} />
    </div>
  );
};
export default Activities;
