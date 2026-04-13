import React, { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { AddHostModal } from '../components/AddHostModal';
import { PlusIcon } from '@heroicons/react/24/outline';
import { 
    ServerStackIcon, 
    ArrowPathIcon, 
    TrashIcon, 
    ComputerDesktopIcon,
    SignalIcon,
    SignalSlashIcon,
    Square3Stack3DIcon,
    CircleStackIcon,
    CubeIcon,
    ChevronDownIcon,
    ChevronUpIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import toast from 'react-hot-toast';

interface Container {
    id: string;
    name: string;
    image: string;
    state: string;
    status: string;
}

interface Host {
    id: string;
    name: string;
    host_info?: {
        hostname?: string;
        os?: string;
        runtime_type?: string;
        runtime_version?: string;
        docker_version?: string;
        kernel_version?: string;
        cpus?: number;
        memory_total?: number;
    };
    runtime_type?: string;
    status: string;
    last_heartbeat?: string;
    last_report?: string;
    mode?: string;
    containers?: Container[];
    images?: any[];
    volumes?: any[];
    networks?: any[];
}

export const Hosts = () => {
    const [hosts, setHosts] = useState<Host[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedHost, setExpandedHost] = useState<string | null>(null);

    const fetchHosts = async () => {
        try {
            const { data } = await api.get('/agents');
            setHosts(data || []);
        } catch (error) {
            console.error("Failed to fetch hosts", error);
            setHosts([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHosts();
        const interval = setInterval(fetchHosts, 15000);
        return () => clearInterval(interval);
    }, []);

    const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: string }>({ isOpen: false, id: '' });
    const [showAddHost, setShowAddHost] = useState(false);

    const handleDelete = (id: string) => {
        setConfirmDelete({ isOpen: true, id });
    };

    const executeDelete = async () => {
        try {
            await api.delete(`/agents/${confirmDelete.id}`);
            toast.success("Host removed");
            fetchHosts();
        } catch (error) {
            toast.error("Failed to remove host");
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'healthy':
                return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'degraded':
                return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
            default:
                return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
        }
    };

    const formatTimeAgo = (timestamp: string) => {
        if (!timestamp) return 'Never';
        const date = new Date(timestamp);
        if (date.getFullYear() < 2000) return 'Never';
        const now = new Date();
        const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    };

    const formatBytes = (bytes: number) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const toggleExpand = (id: string) => {
        setExpandedHost(expandedHost === id ? null : id);
    };

    return (
        <div className="space-y-6">
             <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-500">
                    Hosts
                </h2>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowAddHost(true)}
                        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
                    >
                        <PlusIcon className="w-4 h-4" />
                        Add Host
                    </button>
                    <button
                        onClick={fetchHosts}
                        className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                        <ArrowPathIcon className="w-4 h-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Info Card */}
            <GlassCard className="p-4 bg-blue-500/5 border-blue-500/20">
                <div className="flex items-start space-x-3">
                    <ServerStackIcon className="w-5 h-5 text-blue-400 mt-0.5" />
                    <div>
                        <p className="text-sm text-slate-300">
                            Hosts are machines running the Conman agent. They automatically register and push container data to this server.
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            Click on a host row to see containers and detailed system information.
                        </p>
                    </div>
                </div>
            </GlassCard>

            {/* Hosts List */}
            <div className="space-y-4">
                {loading ? (
                    <GlassCard className="p-8 text-center animate-pulse text-slate-400">Loading...</GlassCard>
                ) : hosts.length === 0 ? (
                    <GlassCard className="p-8 text-center text-slate-500">
                        No hosts connected. Deploy the agent to register hosts.
                    </GlassCard>
                ) : (
                    hosts.map((host) => (
                        <GlassCard key={host.id} className="p-0 overflow-hidden">
                            {/* Main Row */}
                            <div 
                                className="p-4 hover:bg-white/5 cursor-pointer transition-colors"
                                onClick={() => toggleExpand(host.id)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-4">
                                        <div className="p-2 bg-slate-800 rounded-lg">
                                            <ComputerDesktopIcon className="w-6 h-6 text-cyan-400" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-slate-200">{host.name}</p>
                                            <p className="text-xs text-slate-500">
                                                {host.host_info?.hostname || host.id.substring(0, 12)}...
                                            </p>
                                        </div>
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(host.status)}`}>
                                            {host.status === 'healthy' ? (
                                                <SignalIcon className="w-3 h-3 mr-1" />
                                            ) : (
                                                <SignalSlashIcon className="w-3 h-3 mr-1" />
                                            )}
                                            {host.status}
                                        </span>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                                            (host.runtime_type || host.host_info?.runtime_type || 'docker') === 'containerd'
                                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                                : (host.runtime_type || host.host_info?.runtime_type || 'docker') === 'podman'
                                                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                                    : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                        }`}>
                                            {host.runtime_type || host.host_info?.runtime_type || 'docker'}
                                        </span>
                                    </div>

                                    {/* Stats Summary */}
                                    <div className="flex items-center space-x-6">
                                        <div className="flex items-center space-x-2 text-sm">
                                            <Square3Stack3DIcon className="w-4 h-4 text-emerald-400" />
                                            <span className="text-emerald-400 font-semibold">
                                                {host.containers?.filter(c => c.state === 'running').length || 0}
                                            </span>
                                            <span className="text-slate-500">/ {host.containers?.length || 0}</span>
                                        </div>
                                        <div className="flex items-center space-x-2 text-sm">
                                            <CircleStackIcon className="w-4 h-4 text-blue-400" />
                                            <span className="text-slate-400">{host.images?.length || 0}</span>
                                        </div>
                                        <div className="flex items-center space-x-2 text-sm">
                                            <CubeIcon className="w-4 h-4 text-purple-400" />
                                            <span className="text-slate-400">{host.volumes?.length || 0}</span>
                                        </div>
                                        <div className="text-xs text-slate-500 w-24">
                                            {formatTimeAgo(host.last_report || host.last_heartbeat || '')}
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDelete(host.id); }}
                                            className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                                        >
                                            <TrashIcon className="w-5 h-5" />
                                        </button>
                                        {expandedHost === host.id ? (
                                            <ChevronUpIcon className="w-5 h-5 text-slate-400" />
                                        ) : (
                                            <ChevronDownIcon className="w-5 h-5 text-slate-400" />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {expandedHost === host.id && (
                                <div className="border-t border-white/5 bg-slate-900/30">
                                    {/* System Info */}
                                    <div className="p-4 border-b border-white/5">
                                        <h4 className="text-sm font-semibold text-slate-300 mb-3">System Information</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                            <div>
                                                <p className="text-slate-500">OS</p>
                                                <p className="text-slate-300">{host.host_info?.os || 'Unknown'}</p>
                                            </div>
                                            <div>
                                                <p className="text-slate-500">Runtime</p>
                                                <p className="text-slate-300">{host.host_info?.runtime_version || host.host_info?.docker_version || 'Unknown'}</p>
                                            </div>
                                            <div>
                                                <p className="text-slate-500">Kernel</p>
                                                <p className="text-slate-300">{host.host_info?.kernel_version || 'Unknown'}</p>
                                            </div>
                                            <div>
                                                <p className="text-slate-500">Memory</p>
                                                <p className="text-slate-300">{host.host_info?.memory_total ? formatBytes(host.host_info.memory_total) : 'Unknown'}</p>
                                            </div>
                                            <div>
                                                <p className="text-slate-500">CPUs</p>
                                                <p className="text-slate-300">{host.host_info?.cpus || 'Unknown'}</p>
                                            </div>
                                            <div>
                                                <p className="text-slate-500">Mode</p>
                                                <p className="text-slate-300">{host.mode || 'hybrid'}</p>
                                            </div>
                                            <div>
                                                <p className="text-slate-500">Last Report</p>
                                                <p className="text-slate-300">{formatTimeAgo(host.last_report || '')}</p>
                                            </div>
                                            <div>
                                                <p className="text-slate-500">Last Heartbeat</p>
                                                <p className="text-slate-300">{formatTimeAgo(host.last_heartbeat || '')}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Containers */}
                                    <div className="p-4">
                                        <h4 className="text-sm font-semibold text-slate-300 mb-3">
                                            Containers ({host.containers?.length || 0})
                                        </h4>
                                        {host.containers && host.containers.length > 0 ? (
                                            <div className="space-y-2">
                                                {host.containers.slice(0, 10).map((container) => (
                                                    <div key={container.id} className="flex items-center justify-between text-sm bg-slate-800/50 rounded px-3 py-2">
                                                        <div className="flex items-center space-x-3">
                                                            <span className={`w-2 h-2 rounded-full ${container.state === 'running' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                                                            <span className="text-slate-300 font-mono">{container.name?.replace('/', '') || container.id.substring(0, 12)}</span>
                                                        </div>
                                                        <div className="flex items-center space-x-4">
                                                            <span className="text-xs text-slate-500">{container.image}</span>
                                                            <span className={`text-xs px-2 py-0.5 rounded ${container.state === 'running' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                                                                {container.state}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                                {host.containers.length > 10 && (
                                                    <p className="text-xs text-slate-500 text-center py-2">
                                                        + {host.containers.length - 10} more containers
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-slate-500">No containers</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </GlassCard>
                    ))
                )}
            </div>

            {/* Footer */}
            <div className="text-xs text-slate-500 text-center">
                Showing {hosts.length} host(s) • Auto-refresh every 15s
            </div>

            <ConfirmModal
                isOpen={confirmDelete.isOpen}
                onClose={() => setConfirmDelete({ isOpen: false, id: '' })}
                onConfirm={executeDelete}
                title="Remove Host"
                message="Are you sure you want to remove this host? All associated data (snapshots, metrics, alerts) will be deleted."
                confirmText="Remove"
                isDestructive={true}
            />

            <AddHostModal
                isOpen={showAddHost}
                onClose={() => setShowAddHost(false)}
                onHostAdded={() => { setShowAddHost(false); fetchHosts(); }}
            />
        </div>
    );
};
