import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { PlusIcon, PlayIcon, ArrowPathIcon, TrashIcon, DocumentTextIcon, CodeBracketIcon, EyeIcon } from '@heroicons/react/24/solid';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { useHost } from '../contexts/HostContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useLicense } from '../contexts/LicenseContext';
import { UpgradePrompt } from '../components/ui/UpgradePrompt';

interface Stack {
    Name: string;
    Status: string;
    Services: number;
    ConfigFiles: string;
    // ID: number; // Removed as we use string names now
}

export const Stacks = () => {
    const { hasFeature } = useLicense();
    if (!hasFeature('stacks')) {
        return <UpgradePrompt feature="Stack Management" requiredTier="pro" />;
    }

    const { currentHost } = useHost();
    const [stacks, setStacks] = useState<Stack[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const navigate = useNavigate();
    
    // Form State
    const [newName, setNewName] = useState('');
    const [newCompose, setNewCompose] = useState('version: "3.8"\nservices:\n  web:\n    image: nginx:alpine\n    ports:\n      - "8080:80"');
    const [newEnv, setNewEnv] = useState('');

    const fetchStacks = async () => {
        if (!currentHost) return;
        try {
            const { data } = await api.get(`/agents/${currentHost.id}/stacks`);
            setStacks(data || []);
        } catch (error) {
            console.error("Fetch stacks failed", error);
            // toast.error('Failed to load stacks'); // Silent fail on poller
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStacks();
        // Poll status every 10s
        const interval = setInterval(fetchStacks, 10000);
        return () => clearInterval(interval);
    }, [currentHost]);

    const handleCreate = async () => {
        if (!newName) return toast.error('Name is required');
        if (!currentHost) return;
        try {
            await api.post(`/agents/${currentHost.id}/stacks`, {
                name: newName,
                compose_content: newCompose,
                env_content: newEnv
            });
            toast.success('Stack deploying...');
            setIsModalOpen(false);
            setNewName('');
            // Optional: reset compose content
            fetchStacks();
        } catch (error: any) {
            toast.error(`Failed to create stack: ${error.response?.data || error.message}`);
        }
    };

    // Stop is actually "Down" in Docker Compose usually, but here we might want just "stop".
    // However, our agent only supports "Remove" (Down) right now.
    // For now, let's map Stop to Remove/Down or hide it? 
    // The previous UI had Stop and Delete. 
    // Agent `handleRemoveStack` does `docker compose down`.
    // Let's rely on Delete for `down`. Stop might be `stop` command?
    // Current Agent implementation only has `handleRemoveStack` (Down).
    // I will implement handleDelete calling Remove. I will hide Stop for now as technically `down` stops and removes containers.

    const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: string }>({ isOpen: false, id: '' });

    const handleDelete = (name: string) => {
        setConfirmDelete({ isOpen: true, id: name });
    };

    const executeDelete = async () => {
        if (!currentHost) return;
        try {
            await api.delete(`/agents/${currentHost.id}/stacks/${encodeURIComponent(confirmDelete.id)}`);
            toast.success('Stack removed');
            fetchStacks();
        } catch (error: any) {
            toast.error(`Failed to delete stack: ${error.response?.data || error.message}`);
        }
    };

    const handleUp = async (name: string) => {
        if (!currentHost) return;
        try {
            await api.post(`/agents/${currentHost.id}/stacks/${encodeURIComponent(name)}/up`);
            toast.success('Stack starting...');
            fetchStacks();
        } catch (error: any) {
            toast.error(`Failed to start stack: ${error.response?.data || error.message}`);
        }
    };

    const handleRestart = async (name: string) => {
        if (!currentHost) return;
        try {
            await api.post(`/agents/${currentHost.id}/stacks/${encodeURIComponent(name)}/restart`);
            toast.success('Stack restarting...');
            fetchStacks();
        } catch (error: any) {
            toast.error(`Failed to restart stack: ${error.response?.data || error.message}`);
        }
    };

    return (
        <div className="p-6 space-y-6 animate-fade-in">
             <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <DocumentTextIcon className="w-8 h-8 text-indigo-500" />
                    Compose Stacks
                </h1>
                <div className="flex items-center gap-3">
                    {currentHost && (
                         <span className="inline-flex items-center text-xs px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-white/10">
                             Agent: {currentHost.name}
                         </span>
                    )}
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
                    >
                        <PlusIcon className="w-4 h-4" />
                        New Stack
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-20 text-slate-500">Loading...</div>
            ) : stacks.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 dark:bg-white/5 rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10">
                    <DocumentTextIcon className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                    <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">No Stacks Found</h3>
                    <p className="text-slate-500 mt-2">Create your first Docker Compose stack to get started.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {stacks.map(stack => (
                        <div key={stack.Name} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="font-bold text-lg text-slate-800 dark:text-white">{stack.Name}</h3>
                                    <p className="text-xs text-slate-500 mt-1">{stack.Services} Services</p>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                                    stack.Status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                                    stack.Status === 'partial' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                                    'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400'
                                }`}>
                                    {stack.Status}
                                </span>
                            </div>
                            
                            {stack.ConfigFiles && (
                                <div className="mb-4 bg-slate-50 dark:bg-black/20 p-2 rounded text-xs font-mono text-slate-600 dark:text-slate-400 truncate" title={stack.ConfigFiles}>
                                    {stack.ConfigFiles}
                                </div>
                            )}

                            <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-white/5 pt-4">
                                {(stack.Status === 'exited' || stack.Status === 'partial') && (
                                    <button onClick={() => handleUp(stack.Name)} title="Start (Up)" className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-colors">
                                        <PlayIcon className="w-5 h-5" />
                                    </button>
                                )}
                                {stack.Status === 'active' && (
                                    <button onClick={() => handleRestart(stack.Name)} title="Restart" className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-colors">
                                        <ArrowPathIcon className="w-5 h-5" />
                                    </button>
                                )}
                                <button onClick={() => handleDelete(stack.Name)} title="Remove (Down)" className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors">
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-200 dark:border-white/10 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white">New Stack</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                ✕
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Stack Name</label>
                                <input 
                                    type="text" 
                                    value={newName} 
                                    onChange={e => setNewName(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="my-stack"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full min-h-[400px]">
                                <div className="flex flex-col">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">docker-compose.yml</label>
                                    <textarea 
                                        value={newCompose} 
                                        onChange={e => setNewCompose(e.target.value)}
                                        className="flex-1 w-full bg-slate-900 text-slate-300 font-mono text-xs rounded-lg p-4 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">.env (Optional)</label>
                                    <textarea 
                                        value={newEnv} 
                                        onChange={e => setNewEnv(e.target.value)}
                                        className="flex-1 w-full bg-slate-900 text-slate-300 font-mono text-xs rounded-lg p-4 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                        placeholder="KEY=VALUE"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-200 dark:border-white/10 flex justify-end gap-3">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                            <button onClick={handleCreate} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium shadow-lg shadow-indigo-500/30">
                                Deploy Stack
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={confirmDelete.isOpen}
                onClose={() => setConfirmDelete({ isOpen: false, id: '' })}
                onConfirm={executeDelete}
                title="Remove Stack"
                message="This will run compose down, removing all containers and networks for this stack."
                confirmText="Remove Stack"
                isDestructive
            />
        </div>
    );
};
