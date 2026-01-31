import { useState } from 'react';
import { useHost } from '../../contexts/HostContext';
import { GlassCard } from '../ui/GlassCard';
import { ServerStackIcon, TrashIcon, PlusIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { AddHostModal } from '../AddHostModal';
import { ConfirmModal } from '../ui/ConfirmModal';
import api from '../../services/api';
import { toast } from 'react-hot-toast';

export const HostSettings = () => {
    const { hosts, refreshHosts, loading } = useHost();
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean, hostId: string, hostName: string } | null>(null);

    const handleDelete = async () => {
        if (!confirmDelete) return;
        try {
            await api.delete(`/agents/${confirmDelete.hostId}`);
            toast.success(`Host ${confirmDelete.hostName} removed successfully`);
            refreshHosts();
        } catch (error) {
            toast.error("Failed to remove host");
        } finally {
            setConfirmDelete(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                     <h3 className="text-lg font-medium text-slate-900 dark:text-white">Registered Agents</h3>
                     <p className="text-sm text-slate-500">Manage Docker hosts connected to this server</p>
                </div>
                <button 
                    onClick={() => setAddModalOpen(true)}
                    className="flex items-center space-x-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-cyan-500/20"
                >
                    <PlusIcon className="w-5 h-5" />
                    <span>Add Host</span>
                </button>
            </div>

            <GlassCard className="p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                        <thead className="bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Mode</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Stats</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider opacity-0">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white/50 dark:bg-transparent divide-y divide-slate-200 dark:divide-slate-800">
                            {hosts.map((host) => (
                                <tr key={host.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <span className={`inline-flex h-2.5 w-2.5 rounded-full mr-2 ${host.status === 'healthy' ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                                            <span className="text-sm text-slate-500 capitalize">{host.status}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <ServerStackIcon className="h-5 w-5 text-slate-400 mr-3" />
                                            <div className="text-sm font-medium text-slate-900 dark:text-white">{host.name}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs font-mono">{host.mode || 'unknown'}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono text-xs">
                                        {host.host_info ? (
                                             <>
                                             CPUs: {host.host_info.cpu_count || '-'} <br/>
                                             Mem: {host.host_info.mem_total ? Math.round(host.host_info.mem_total / 1024 / 1024 / 1024) + 'GB' : '-'}
                                             </>
                                        ) : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {host.id !== 'local' && (
                                            <button 
                                                onClick={() => setConfirmDelete({ isOpen: true, hostId: host.id, hostName: host.name })}
                                                className="text-slate-400 hover:text-rose-500 transition-colors p-2 rounded-full hover:bg-rose-500/10"
                                            >
                                                <TrashIcon className="w-5 h-5" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {hosts.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                                        No agents connected. Click "Add Host" to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </GlassCard>

            <AddHostModal 
                isOpen={addModalOpen} 
                onClose={() => setAddModalOpen(false)} 
                onHostAdded={refreshHosts} 
            />

            <ConfirmModal
                isOpen={!!confirmDelete}
                onClose={() => setConfirmDelete(null)}
                onConfirm={handleDelete}
                title="Remove Host"
                message={`Are you sure you want to remove host "${confirmDelete?.hostName}"? This will stop monitoring but will not affect the host itself.`}
                isDestructive={true}
                confirmText="Remove"
            />
        </div>
    );
};
