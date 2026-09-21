import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { CubeIcon, ArrowLeftIcon, StopIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import { ClipboardDocumentIcon, CheckIcon, BoltIcon } from '@heroicons/react/24/outline';

interface ContainerInfo {
    Name: string;
    State: string;
    Service: string;
    // Mirrors service.ContainerInfo.Publishers in backend/internal/service/compose.go
    Publishers: {
        URL: string;
        TargetPort: number;
        PublishedPort: number;
        Protocol: string;
    }[];
}

interface Stack {
    ID: number;
    Name: string;
    Status: string;
    Message: string;
    ComposeContent: string;
    EnvContent: string;
    CreatedAt: string;
    containers: ContainerInfo[];
}

export const StackDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [stack, setStack] = useState<Stack | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'containers' | 'config' | 'gitops'>('containers');
    const [copied, setCopied] = useState(false);
    const [triggering, setTriggering] = useState(false);
    
    // Edit State
    const [editCompose, setEditCompose] = useState('');
    const [editEnv, setEditEnv] = useState('');
    const [saving, setSaving] = useState(false);

    const fetchStack = async () => {
        try {
            const { data } = await api.get(`/stacks/${id}`);
            setStack(data);
            // Only update edit state if not dirty? For now just reset on fetch if not saving
            if (!saving) {
                setEditCompose(data.ComposeContent);
                setEditEnv(data.EnvContent);
            }
        } catch (error) {
            toast.error('Failed to load stack details');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStack();
        const interval = setInterval(fetchStack, 5000);
        return () => clearInterval(interval);
    }, [id]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put(`/stacks/${id}`, {
                name: stack?.Name, // Name doesn't change
                compose_content: editCompose,
                env_content: editEnv
            });
            toast.success('Configuration saved. Redeploying...');
            fetchStack();
        } catch (error) {
            toast.error('Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };
    
    const handleTriggerWebhook = async () => {
        setTriggering(true);
        try {
            await api.post(`/stacks/${id}/webhook`);
            toast.success('Deployment triggered successfully via webhook!');
            fetchStack();
        } catch (error) {
            toast.error('Failed to trigger webhook deployment');
        } finally {
            setTriggering(false);
        }
    };

    const copyWebhookUrl = (url: string) => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success('Webhook URL copied to clipboard');
        setTimeout(() => setCopied(false), 2500);
    };

    const handleStop = async () => {
        try {
            await api.post(`/stacks/${id}/stop`);
            toast.success('Stopping stack...');
            fetchStack();
        } catch (error) {
            toast.error('Failed to stop stack');
        }
    };

    if (loading) return <div className="p-6 text-center text-slate-500">Loading...</div>;
    if (!stack) return <div className="p-6 text-center text-slate-500">Stack not found</div>;

    return (
        <div className="p-6 space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/stacks')} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-500">
                    <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <div>
                     <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <CubeIcon className="w-8 h-8 text-indigo-500" />
                        {stack.Name}
                    </h1>
                     <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                            stack.Status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                            stack.Status === 'deploying' || stack.Status === 'updating' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 animate-pulse' :
                            stack.Status === 'error' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' :
                            'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400'
                        }`}>
                            {stack.Status}
                        </span>
                        <span className="text-xs text-slate-400">Created {new Date(stack.CreatedAt).toLocaleString()}</span>
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                     <button 
                        onClick={handleTriggerWebhook}
                        disabled={triggering || stack.Status === 'deploying' || stack.Status === 'updating'}
                        className="flex items-center gap-2 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors text-sm font-medium shadow-sm disabled:opacity-50"
                        title="Trigger Instant Zero-Downtime Redeploy"
                     >
                        <ArrowPathIcon className={`w-4 h-4 ${triggering ? 'animate-spin' : ''}`} />
                        <span>{triggering ? 'Triggering...' : 'Redeploy'}</span>
                    </button>
                     <button onClick={handleStop} className="flex items-center gap-2 px-3 py-1.5 bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-500/20 rounded-lg transition-colors text-sm font-medium">
                        <StopIcon className="w-4 h-4" /> Stop
                    </button>
                </div>
            </div>
            
            {stack.Message && (
                 <div className="bg-slate-50 dark:bg-black/20 p-3 rounded-lg border border-slate-200 dark:border-white/5 font-mono text-sm text-slate-600 dark:text-slate-300">
                    {stack.Message}
                </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-white/10">
                <button 
                    onClick={() => setActiveTab('containers')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'containers' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    Containers ({stack.containers?.length || 0})
                </button>
                <button 
                    onClick={() => setActiveTab('config')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'config' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    Configuration
                </button>
                <button 
                    onClick={() => setActiveTab('gitops')}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'gitops' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    <BoltIcon className="w-4 h-4 text-amber-500" />
                    <span>GitOps & Webhook</span>
                </button>
            </div>

            {/* Content */}
            {activeTab === 'containers' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                            <tr>
                                <th className="px-6 py-3 font-semibold text-slate-700 dark:text-slate-300">Service</th>
                                <th className="px-6 py-3 font-semibold text-slate-700 dark:text-slate-300">Container Name</th>
                                <th className="px-6 py-3 font-semibold text-slate-700 dark:text-slate-300">State</th>
                                <th className="px-6 py-3 font-semibold text-slate-700 dark:text-slate-300">Ports</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {stack.containers?.map((c) => (
                                <tr key={c.Name} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-3 font-medium text-slate-800 dark:text-slate-200">{c.Service}</td>
                                    <td className="px-6 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{c.Name}</td>
                                    <td className="px-6 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${c.State === 'running' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-600'}`}>
                                            {c.State}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-slate-600 dark:text-slate-400 text-xs">
                                        {c.Publishers?.map(p => (
                                            <div key={p.PublishedPort}>{p.PublishedPort}:{p.TargetPort}/{p.Protocol}</div>
                                        ))}
                                    </td>
                                </tr>
                            ))}
                            {(!stack.containers || stack.containers.length === 0) && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                                        No active containers found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'config' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex justify-between items-center">
                            docker-compose.yml
                            <span className="text-xs text-slate-400">YAML</span>
                        </label>
                        <textarea 
                            value={editCompose}
                            onChange={e => setEditCompose(e.target.value)}
                            className="flex-1 w-full bg-slate-900 text-slate-100 font-mono text-xs p-4 rounded-xl border border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed"
                            spellCheck={false}
                        />
                    </div>
                     <div className="flex flex-col space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex justify-between items-center">
                            .env
                            <span className="text-xs text-slate-400">KEY=VALUE</span>
                        </label>
                        <textarea 
                            value={editEnv}
                            onChange={e => setEditEnv(e.target.value)}
                            className="flex-1 w-full bg-slate-900 text-slate-100 font-mono text-xs p-4 rounded-xl border border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed"
                            spellCheck={false}
                        />
                        <div className="pt-4 flex justify-end">
                            <button 
                                onClick={handleSave} 
                                disabled={saving}
                                className={`flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium shadow-lg shadow-indigo-500/30 transition-all ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {saving ? 'Deploying...' : 'Save & Redeploy'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'gitops' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <BoltIcon className="w-5 h-5 text-amber-500" />
                                    Continuous Deployment Webhook
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    Trigger automated zero-downtime stack redeployments from GitHub Actions, GitLab CI, or Webhook notifications.
                                </p>
                            </div>
                            <button
                                onClick={handleTriggerWebhook}
                                disabled={triggering || stack.Status === 'deploying' || stack.Status === 'updating'}
                                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50"
                            >
                                <ArrowPathIcon className={`w-4 h-4 ${triggering ? 'animate-spin' : ''}`} />
                                <span>Test Webhook Trigger</span>
                            </button>
                        </div>

                        <div className="space-y-2 mt-4">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Webhook Endpoint URL
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-white/10 rounded-xl font-mono text-xs text-indigo-600 dark:text-indigo-400 truncate select-all">
                                    {`${window.location.origin}/api/v1/webhooks/stacks/${stack.ID}`}
                                </div>
                                <button
                                    onClick={() => copyWebhookUrl(`${window.location.origin}/api/v1/webhooks/stacks/${stack.ID}`)}
                                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-colors border border-slate-200 dark:border-white/10"
                                >
                                    {copied ? (
                                        <>
                                            <CheckIcon className="w-4 h-4 text-emerald-500" />
                                            <span>Copied!</span>
                                        </>
                                    ) : (
                                        <>
                                            <ClipboardDocumentIcon className="w-4 h-4" />
                                            <span>Copy URL</span>
                                        </>
                                    )}
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">
                                An unauthenticated POST request to this endpoint will instantly trigger <code className="font-mono text-slate-700 dark:text-slate-300">docker compose up -d</code>.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* cURL Example */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                            <div>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Trigger via cURL / CLI</h4>
                                <p className="text-xs text-slate-500 mb-3">Execute anytime from your terminal or custom deployment script.</p>
                                <div className="p-3 bg-slate-950 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto border border-slate-800 leading-relaxed">
                                    curl -X POST {`${window.location.origin}/api/v1/webhooks/stacks/${stack.ID}`}
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex justify-end">
                                <button
                                    onClick={() => copyWebhookUrl(`curl -X POST ${window.location.origin}/api/v1/webhooks/stacks/${stack.ID}`)}
                                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                                >
                                    <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                    Copy cURL command
                                </button>
                            </div>
                        </div>

                        {/* GitHub Actions Workflow Example */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                            <div>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">GitHub Actions Step</h4>
                                <p className="text-xs text-slate-500 mb-3">Add to your CI pipeline on merge to main.</p>
                                <div className="p-3 bg-slate-950 text-indigo-300 font-mono text-[11px] rounded-xl overflow-x-auto border border-slate-800 leading-relaxed">
{`- name: Trigger Conman Deploy
  run: |
    curl -X POST ${window.location.origin}/api/v1/webhooks/stacks/${stack.ID}`}
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex justify-end">
                                <button
                                    onClick={() => copyWebhookUrl(`- name: Trigger Conman Deploy
  run: |
    curl -X POST ${window.location.origin}/api/v1/webhooks/stacks/${stack.ID}`)}
                                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                                >
                                    <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                                    Copy YAML snippet
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

