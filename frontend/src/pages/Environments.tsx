import React, { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { 
    ServerStackIcon, 
    PlusIcon, 
    ArrowPathIcon, 
    TrashIcon, 
    PencilIcon,
    CheckCircleIcon,
    XCircleIcon,
    ComputerDesktopIcon,
    EllipsisHorizontalIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';

interface Environment {
    ID: number;
    Name: string;
    APIURL: string;
    Status: 'online' | 'offline';
    Enabled: boolean;
    IsLocal: boolean;
    LastSeen?: string;
}

export const Environments = () => {
    const [environments, setEnvironments] = useState<Environment[]>([]);
    const [loading, setLoading] = useState(true);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    
    // Form State
    const [name, setName] = useState('');
    const [apiUrl, setApiUrl] = useState('');
    const [authToken, setAuthToken] = useState('');

    const fetchEnvironments = async () => {
        try {
            const { data } = await api.get('/environments');
            setEnvironments(data || []);
        } catch (error) {
            console.error("Failed to fetch environments", error);
            // Fallback mock data for dev until backend is ready
            if (process.env.NODE_ENV === 'development') {
                setEnvironments([
                    { ID: 1, Name: 'Local Docker', APIURL: 'unix:///var/run/docker.sock', Status: 'online', Enabled: true, IsLocal: true },
                ]);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEnvironments();
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/environments', { name, api_url: apiUrl, auth_token: authToken });
            toast.success("Environment added successfully");
            setCreateModalOpen(false);
            setName('');
            setApiUrl('');
            setAuthToken('');
            fetchEnvironments();
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Failed to add environment");
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to remove this environment?')) return;
        try {
            await api.delete(`/environments/${id}`);
            toast.success("Environment removed");
            fetchEnvironments();
        } catch (error) {
            toast.error("Failed to remove environment");
        }
    };

    return (
        <div className="space-y-6">
             <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">
                    Environments
                </h2>
                <div className="flex items-center space-x-3">
                    <button 
                        onClick={() => setCreateModalOpen(true)}
                        className="flex items-center space-x-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-emerald-500/20"
                    >
                        <PlusIcon className="w-5 h-5" />
                        <span>Add Environment</span>
                    </button>
                    <GlassCard className="px-4 py-2 flex items-center space-x-2 text-sm text-emerald-400 cursor-pointer hover:bg-white/5 transition-colors" role="button" onClick={fetchEnvironments}>
                        <ArrowPathIcon className="w-4 h-4" />
                        <span>Refresh</span>
                    </GlassCard>
                </div>
            </div>

            {/* List */}
            <GlassCard className="overflow-hidden p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                        <thead className="bg-white/5 text-slate-200 uppercase font-medium">
                            <tr>
                                <th className="px-6 py-4 w-12 text-center">
                                    <input type="checkbox" className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0" />
                                </th>
                                <th className="px-6 py-4">Name</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Enabled</th>
                                <th className="px-6 py-4">API URL</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr><td colSpan={6} className="px-6 py-8 text-center animate-pulse">Loading...</td></tr>
                            ) : environments.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No environments configured.</td></tr>
                            ) : (
                                environments.map((env) => (
                                    <tr key={env.ID} className="hover:bg-white/5 transition-colors group">
                                         <td className="px-6 py-4 text-center">
                                            <input type="checkbox" className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0" />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center space-x-3">
                                                <div className="p-2 bg-slate-800 rounded-lg">
                                                    <ComputerDesktopIcon className="w-5 h-5 text-slate-400" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-slate-200">{env.Name}</p>
                                                    {env.IsLocal && <span className="text-xs text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded border border-blue-400/20">Current</span>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                                env.Status === 'online' 
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                            }`}>
                                                {env.Status === 'online' ? 'Online' : 'Offline'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                             <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                                env.Enabled
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                                : 'bg-slate-700 text-slate-400 border-slate-600'
                                            }`}>
                                                {env.Enabled ? 'Enabled' : 'Disabled'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs text-slate-500">
                                            {env.APIURL}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="text-slate-500 hover:text-white transition-colors">
                                                <EllipsisHorizontalIcon className="w-6 h-6" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* Pagination / Footer */}
                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
                    <span>Showing {environments.length} of {environments.length} item(s).</span>
                    <div className="flex space-x-2">
                         <div className="flex items-center space-x-2">
                             <span>Rows per page</span>
                             <select className="bg-slate-800 border border-white/10 rounded px-2 py-1 outline-none text-slate-300">
                                 <option>20</option>
                             </select>
                         </div>
                    </div>
                </div>
            </GlassCard>

             {/* Create Modal */}
            <Transition.Root show={createModalOpen} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={setCreateModalOpen}>
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-[#0f172a] border border-white/10 p-6 text-left align-middle shadow-xl transition-all">
                                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-white mb-4">
                                    Add Environment
                                </Dialog.Title>
                                <form onSubmit={handleCreate} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
                                        <input
                                            type="text"
                                            required
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 placeholder-slate-600"
                                            placeholder="Production Server"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">API URL</label>
                                        <input
                                            type="text"
                                            required
                                            value={apiUrl}
                                            onChange={(e) => setApiUrl(e.target.value)}
                                            className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 placeholder-slate-600"
                                            placeholder="http://10.10.10.5:2375"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">Docker Socket or HTTP API URL</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">Auth Token (Optional)</label>
                                        <input
                                            type="password"
                                            value={authToken}
                                            onChange={(e) => setAuthToken(e.target.value)}
                                            className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 placeholder-slate-600"
                                            placeholder="••••••••••••"
                                        />
                                    </div>
                                    <div className="mt-6 flex justify-end space-x-3">
                                        <button
                                            type="button"
                                            onClick={() => setCreateModalOpen(false)}
                                            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-lg shadow-emerald-500/20"
                                        >
                                            Add Environment
                                        </button>
                                    </div>
                                </form>
                            </Dialog.Panel>
                        </div>
                    </div>
                </Dialog>
            </Transition.Root>
        </div>
    );
};
