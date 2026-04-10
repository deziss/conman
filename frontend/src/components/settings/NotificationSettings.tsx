import { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Switch } from '@headlessui/react';
import { PlusIcon, TrashIcon, BellAlertIcon } from '@heroicons/react/24/outline';
import { ConfirmModal } from '../ui/ConfirmModal';
import api from '../../services/api';
import { toast } from 'react-hot-toast';

interface AlertRule {
    ID: number;
    Name: string;
    Type: string;
    Config: string;
    Enabled: boolean;
}

interface AlertChannel {
    ID: number;
    Name: string;
    Type: string;
    Config: string;
}

export const NotificationSettings = () => {
    const [rules, setRules] = useState<AlertRule[]>([]);
    const [channels, setChannels] = useState<AlertChannel[]>([]);
    const [newWebhookUrl, setNewWebhookUrl] = useState('');
    const [newWebhookName, setNewWebhookName] = useState('');
    const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: number; type: string }>({ isOpen: false, id: 0, type: '' });

    const fetchData = async () => {
        try {
            const [rulesRes, channelsRes] = await Promise.all([
                api.get('/alerts/rules'),
                api.get('/alerts/channels'),
            ]);
            setRules(rulesRes.data || []);
            setChannels(channelsRes.data || []);
        } catch {
            // Silent fail on first load
        }
    };

    useEffect(() => { fetchData(); }, []);

    const toggleRule = async (rule: AlertRule) => {
        try {
            await api.put(`/alerts/rules/${rule.ID}`, { ...rule, Enabled: !rule.Enabled });
            toast.success(`Rule ${!rule.Enabled ? 'enabled' : 'disabled'}`);
            fetchData();
        } catch {
            toast.error('Failed to update rule');
        }
    };

    const addDefaultRule = async () => {
        try {
            await api.post('/alerts/rules', {
                name: 'Agent Offline',
                type: 'agent_offline',
                config: JSON.stringify({ timeout_minutes: 5 }),
                enabled: true,
            });
            toast.success('Alert rule created');
            fetchData();
        } catch {
            toast.error('Failed to create rule (may already exist)');
        }
    };

    const addWebhook = async () => {
        if (!newWebhookUrl || !newWebhookName) return toast.error('Name and URL required');
        try {
            await api.post('/alerts/channels', {
                name: newWebhookName,
                type: 'webhook',
                config: JSON.stringify({ url: newWebhookUrl }),
            });
            toast.success('Webhook added');
            setNewWebhookUrl('');
            setNewWebhookName('');
            fetchData();
        } catch {
            toast.error('Failed to add webhook');
        }
    };

    const executeDelete = async () => {
        try {
            if (confirmDelete.type === 'rule') {
                await api.delete(`/alerts/rules/${confirmDelete.id}`);
            } else {
                await api.delete(`/alerts/channels/${confirmDelete.id}`);
            }
            toast.success('Deleted');
            fetchData();
        } catch {
            toast.error('Delete failed');
        }
    };

    return (
        <div className="space-y-6">
            {/* Alert Rules */}
            <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <BellAlertIcon className="w-5 h-5 text-amber-400" />
                        <h3 className="text-lg font-medium text-white">Alert Rules</h3>
                    </div>
                    <button
                        onClick={addDefaultRule}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-lg transition-colors"
                    >
                        <PlusIcon className="w-4 h-4" />
                        Add Rule
                    </button>
                </div>

                {rules.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-6">No alert rules configured. Click "Add Rule" to get started.</p>
                ) : (
                    <div className="space-y-3">
                        {rules.map((rule) => (
                            <div key={rule.ID} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-white/5">
                                <div>
                                    <p className="text-sm font-medium text-slate-200">{rule.Name}</p>
                                    <p className="text-xs text-slate-500">Type: {rule.Type}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Switch
                                        checked={rule.Enabled}
                                        onChange={() => toggleRule(rule)}
                                        className={`${rule.Enabled ? 'bg-cyan-600' : 'bg-slate-700'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
                                    >
                                        <span className={`${rule.Enabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                                    </Switch>
                                    <button
                                        onClick={() => setConfirmDelete({ isOpen: true, id: rule.ID, type: 'rule' })}
                                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </GlassCard>

            {/* Webhook Channels */}
            <GlassCard className="p-6">
                <h3 className="text-lg font-medium text-white mb-4">Notification Channels</h3>

                {channels.length > 0 && (
                    <div className="space-y-3 mb-4">
                        {channels.map((ch) => {
                            let url = '';
                            try { url = JSON.parse(ch.Config).url; } catch {}
                            return (
                                <div key={ch.ID} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-white/5">
                                    <div>
                                        <p className="text-sm font-medium text-slate-200">{ch.Name}</p>
                                        <p className="text-xs text-slate-500 font-mono truncate max-w-md">{url}</p>
                                    </div>
                                    <button
                                        onClick={() => setConfirmDelete({ isOpen: true, id: ch.ID, type: 'channel' })}
                                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newWebhookName}
                        onChange={(e) => setNewWebhookName(e.target.value)}
                        placeholder="Channel name"
                        className="flex-[2] bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                    <input
                        type="url"
                        value={newWebhookUrl}
                        onChange={(e) => setNewWebhookUrl(e.target.value)}
                        placeholder="https://hooks.slack.com/services/..."
                        className="flex-[5] bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                    <button
                        onClick={addWebhook}
                        className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors"
                    >
                        Add
                    </button>
                </div>
            </GlassCard>

            <ConfirmModal
                isOpen={confirmDelete.isOpen}
                onClose={() => setConfirmDelete({ isOpen: false, id: 0, type: '' })}
                onConfirm={executeDelete}
                title={`Delete ${confirmDelete.type === 'rule' ? 'Alert Rule' : 'Notification Channel'}`}
                message="Are you sure? This action cannot be undone."
                confirmText="Delete"
                isDestructive={true}
            />
        </div>
    );
};
