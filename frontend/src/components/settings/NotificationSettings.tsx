import React, { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Switch, Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { 
    PlusIcon, 
    TrashIcon, 
    BellAlertIcon, 
    PaperAirplaneIcon,
    XMarkIcon,
    GlobeAltIcon,
    ClockIcon
} from '@heroicons/react/24/outline';
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

export const NotificationSettings: React.FC = () => {
    const [rules, setRules] = useState<AlertRule[]>([]);
    const [channels, setChannels] = useState<AlertChannel[]>([]);
    const [loading, setLoading] = useState(true);
    const [testingChannelId, setTestingChannelId] = useState<number | null>(null);

    // New Channel Form
    const [channelType, setChannelType] = useState<'webhook' | 'com0'>('webhook');
    const [newWebhookName, setNewWebhookName] = useState('');
    const [newWebhookUrl, setNewWebhookUrl] = useState('');
    const [com0Endpoint, setCom0Endpoint] = useState('http://localhost:3000');
    const [com0ApiKey, setCom0ApiKey] = useState('');
    const [com0SubChannel, setCom0SubChannel] = useState('whatsapp');
    const [com0Recipient, setCom0Recipient] = useState('');
    const [addingChannel, setAddingChannel] = useState(false);

    // Add Rule Modal
    const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
    const [ruleName, setRuleName] = useState('Agent Disconnected');
    const [ruleType, setRuleType] = useState('agent_offline');
    const [timeoutMinutes, setTimeoutMinutes] = useState(5);
    const [creatingRule, setCreatingRule] = useState(false);

    // Delete Confirmation Modal
    const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: number; type: 'rule' | 'channel'; title: string }>({
        isOpen: false,
        id: 0,
        type: 'rule',
        title: ''
    });

    const fetchData = async () => {
        try {
            const [rulesRes, channelsRes] = await Promise.all([
                api.get('/alerts/rules'),
                api.get('/alerts/channels'),
            ]);
            setRules(rulesRes.data || []);
            setChannels(channelsRes.data || []);
        } catch (error: any) {
            console.error('Failed to load alert rules or channels:', error);
            const msg = error.response?.data?.error || 'Failed to fetch alerts';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const toggleRule = async (rule: AlertRule) => {
        const updatedEnabled = !rule.Enabled;
        try {
            await api.put(`/alerts/rules/${rule.ID}`, {
                name: rule.Name,
                type: rule.Type,
                enabled: updatedEnabled,
            });
            setRules(prev => prev.map(r => r.ID === rule.ID ? { ...r, Enabled: updatedEnabled } : r));
            toast.success(updatedEnabled ? 'Alert rule enabled' : 'Alert rule disabled');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to update rule');
        }
    };

    const handleCreateRule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ruleName.trim()) return toast.error('Rule name is required');

        setCreatingRule(true);
        try {
            await api.post('/alerts/rules', {
                name: ruleName.trim(),
                type: ruleType,
                config: JSON.stringify({ timeout_minutes: Number(timeoutMinutes) || 5 }),
                enabled: true,
            });
            toast.success(`Alert rule "${ruleName}" created`);
            setIsRuleModalOpen(false);
            setRuleName('Agent Disconnected');
            setTimeoutMinutes(5);
            fetchData();
        } catch (error: any) {
            const msg = error.response?.data?.error || 'Failed to create alert rule';
            toast.error(msg);
        } finally {
            setCreatingRule(false);
        }
    };

    const addWebhook = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newWebhookName.trim()) return toast.error('Channel name is required');

        setAddingChannel(true);
        try {
            if (channelType === 'com0') {
                if (!com0Recipient.trim()) {
                    setAddingChannel(false);
                    return toast.error('Recipient phone number or email is required');
                }
                await api.post('/alerts/channels', {
                    name: newWebhookName.trim(),
                    type: 'com0',
                    config: JSON.stringify({
                        endpoint: com0Endpoint.trim() || 'http://localhost:3000',
                        api_key: com0ApiKey.trim(),
                        channel: com0SubChannel,
                        to: com0Recipient.trim(),
                    }),
                });
                toast.success('Com0 notification channel added');
                setNewWebhookName('');
                setCom0Recipient('');
            } else {
                if (!newWebhookUrl.trim()) {
                    setAddingChannel(false);
                    return toast.error('Webhook URL is required');
                }
                await api.post('/alerts/channels', {
                    name: newWebhookName.trim(),
                    type: 'webhook',
                    config: JSON.stringify({ url: newWebhookUrl.trim() }),
                });
                toast.success('Webhook notification channel added');
                setNewWebhookName('');
                setNewWebhookUrl('');
            }
            fetchData();
        } catch (error: any) {
            const msg = error.response?.data?.error || 'Failed to add notification channel';
            toast.error(msg);
        } finally {
            setAddingChannel(false);
        }
    };

    const handleTestChannel = async (channelId: number) => {
        setTestingChannelId(channelId);
        try {
            await api.post(`/alerts/channels/${channelId}/test`);
            toast.success('Test notification sent successfully!');
        } catch (error: any) {
            const msg = error.response?.data?.error || 'Failed to send test notification';
            toast.error(msg);
        } finally {
            setTestingChannelId(null);
        }
    };

    const executeDelete = async () => {
        try {
            if (confirmDelete.type === 'rule') {
                await api.delete(`/alerts/rules/${confirmDelete.id}`);
                toast.success('Alert rule removed');
            } else {
                await api.delete(`/alerts/channels/${confirmDelete.id}`);
                toast.success('Notification channel removed');
            }
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to delete');
        } finally {
            setConfirmDelete({ isOpen: false, id: 0, type: 'rule', title: '' });
        }
    };

    const parseConfig = (raw: string) => {
        try {
            return typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
        } catch {
            return {};
        }
    };

    return (
        <div className="space-y-6">
            {/* ALERT RULES CARD */}
            <GlassCard className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-200 dark:border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
                            <BellAlertIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">System Alert Rules</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Automatically evaluate host agent and container health to trigger incident notifications
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsRuleModalOpen(true)}
                        className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-xl transition-all shadow-md shadow-cyan-500/20 shrink-0"
                    >
                        <PlusIcon className="w-4 h-4" />
                        <span>Create Alert Rule</span>
                    </button>
                </div>

                {loading ? (
                    <div className="py-10 text-center text-xs text-slate-400 animate-pulse">
                        Loading alert configuration...
                    </div>
                ) : rules.length === 0 ? (
                    <div className="py-10 text-center px-4 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-dashed border-slate-200 dark:border-white/10">
                        <BellAlertIcon className="w-9 h-9 text-slate-400 mx-auto mb-2 opacity-60" />
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No alert rules configured yet</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-4">
                            Create an alert rule to get notified when an agent goes offline or a container encounters an unexpected stop.
                        </p>
                        <button
                            onClick={() => setIsRuleModalOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10 hover:bg-cyan-100 rounded-lg border border-cyan-200 dark:border-cyan-500/20 transition-colors"
                        >
                            <PlusIcon className="w-3.5 h-3.5" />
                            Add First Rule
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {rules.map((rule) => {
                            const cfg = parseConfig(rule.Config);
                            return (
                                <div 
                                    key={rule.ID} 
                                    className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10 transition-colors"
                                >
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className={`w-2.5 h-2.5 mt-1.5 rounded-full shrink-0 ${rule.Enabled ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-slate-400'}`} />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                                                    {rule.Name}
                                                </p>
                                                <span className="px-2 py-0.5 text-[10px] font-mono uppercase font-medium bg-slate-200/80 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 rounded border border-slate-300/60 dark:border-slate-600/40">
                                                    {rule.Type.replace('_', ' ')}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                                                <ClockIcon className="w-3.5 h-3.5" />
                                                <span>
                                                    {rule.Type === 'agent_offline' 
                                                        ? `Triggers after ${cfg.timeout_minutes || 5} min of missed heartbeats` 
                                                        : 'Immediate trigger'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0 ml-3">
                                        <Switch
                                            checked={rule.Enabled}
                                            onChange={() => toggleRule(rule)}
                                            className={`${
                                                rule.Enabled ? 'bg-cyan-600' : 'bg-slate-300 dark:bg-slate-700'
                                            } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none`}
                                            title={rule.Enabled ? 'Click to disable' : 'Click to enable'}
                                        >
                                            <span className={`${rule.Enabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm`} />
                                        </Switch>
                                        <button
                                            onClick={() => setConfirmDelete({ isOpen: true, id: rule.ID, type: 'rule', title: rule.Name })}
                                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                                            title="Delete Rule"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </GlassCard>

            {/* NOTIFICATION CHANNELS CARD */}
            <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200 dark:border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 shrink-0">
                            <GlobeAltIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Notification Channels</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Receive incident alerts on Slack, Discord, Microsoft Teams, or custom webhook endpoints
                            </p>
                        </div>
                    </div>
                </div>

                {/* Configured Channels List */}
                {channels.length > 0 && (
                    <div className="space-y-3 mb-6">
                        {channels.map((ch) => {
                            const cfg = parseConfig(ch.Config);
                            const displaySummary = ch.Type === 'com0' 
                                ? `Com0 [${(cfg.channel || 'SMS').toUpperCase()}]: ${cfg.to} via ${cfg.endpoint || 'http://localhost:3000'}`
                                : (cfg.url || ch.Config || '');
                            const isTesting = testingChannelId === ch.ID;

                            return (
                                <div 
                                    key={ch.ID} 
                                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-white/5 gap-3"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{ch.Name}</p>
                                            <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 rounded border border-indigo-200 dark:border-indigo-500/20">
                                                {ch.Type}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 font-mono truncate max-w-xl mt-1" title={displaySummary}>
                                            {displaySummary}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                        <button
                                            onClick={() => handleTestChannel(ch.ID)}
                                            disabled={isTesting}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-lg border border-indigo-200 dark:border-indigo-500/20 transition-colors"
                                            title="Send a test message to this channel"
                                        >
                                            <PaperAirplaneIcon className={`w-3.5 h-3.5 ${isTesting ? 'animate-bounce' : ''}`} />
                                            <span>{isTesting ? 'Testing...' : 'Send Test'}</span>
                                        </button>
                                        <button
                                            onClick={() => setConfirmDelete({ isOpen: true, id: ch.ID, type: 'channel', title: ch.Name })}
                                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                                            title="Remove Channel"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Add Channel Form */}
                <form onSubmit={addWebhook} className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Add Notification Channel
                        </h4>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setChannelType('webhook')}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                                    channelType === 'webhook'
                                        ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                            >
                                Webhook (Slack / Discord)
                            </button>
                            <button
                                type="button"
                                onClick={() => setChannelType('com0')}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                                    channelType === 'com0'
                                        ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30'
                                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                            >
                                Com0 (WhatsApp / SMS / Push)
                            </button>
                        </div>
                    </div>

                    {channelType === 'webhook' ? (
                        <div className="flex flex-col sm:flex-row gap-2.5">
                            <input
                                type="text"
                                value={newWebhookName}
                                onChange={(e) => setNewWebhookName(e.target.value)}
                                placeholder="Channel Name (e.g. #devops-alerts)"
                                className="sm:w-64 bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                            />
                            <input
                                type="url"
                                value={newWebhookUrl}
                                onChange={(e) => setNewWebhookUrl(e.target.value)}
                                placeholder="Webhook URL (https://hooks.slack.com/services/...)"
                                className="flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                            />
                            <button
                                type="submit"
                                disabled={addingChannel}
                                className="px-5 py-2.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl transition-all shadow-md hover:shadow-cyan-500/20 shrink-0 flex items-center justify-center gap-1.5"
                            >
                                <PlusIcon className="w-4 h-4" />
                                <span>{addingChannel ? 'Adding...' : 'Add Webhook'}</span>
                            </button>
                        </div>
                    ) : (
                        <div className="p-3.5 rounded-xl bg-purple-500/[0.03] border border-purple-500/20 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <input
                                    type="text"
                                    value={newWebhookName}
                                    onChange={(e) => setNewWebhookName(e.target.value)}
                                    placeholder="Channel Name (e.g. WhatsApp Ops)"
                                    className="bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                />
                                <select
                                    value={com0SubChannel}
                                    onChange={(e) => setCom0SubChannel(e.target.value)}
                                    className="bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                >
                                    <option value="whatsapp">WhatsApp (Com0)</option>
                                    <option value="sms">SMS (Com0)</option>
                                    <option value="email">Email (Com0)</option>
                                    <option value="push">Push Notification (Com0)</option>
                                </select>
                                <input
                                    type="text"
                                    value={com0Recipient}
                                    onChange={(e) => setCom0Recipient(e.target.value)}
                                    placeholder="Recipient (+15555550123 / email)"
                                    className="bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <input
                                    type="url"
                                    value={com0Endpoint}
                                    onChange={(e) => setCom0Endpoint(e.target.value)}
                                    placeholder="Com0 Endpoint (http://localhost:3000)"
                                    className="bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                />
                                <div className="flex gap-2">
                                    <input
                                        type="password"
                                        value={com0ApiKey}
                                        onChange={(e) => setCom0ApiKey(e.target.value)}
                                        placeholder="Com0 API Key (Optional for local)"
                                        className="flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                    />
                                    <button
                                        type="submit"
                                        disabled={addingChannel}
                                        className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-xl transition-all shadow-md hover:shadow-purple-500/20 shrink-0 flex items-center justify-center gap-1.5"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        <span>{addingChannel ? 'Adding...' : 'Add Com0'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </form>
            </GlassCard>

            {/* CREATE ALERT RULE MODAL */}
            <Transition appear show={isRuleModalOpen} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setIsRuleModalOpen(false)}>
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-200"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-150"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" />
                    </Transition.Child>

                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <Transition.Child
                                as={Fragment}
                                enter="ease-out duration-200"
                                enterFrom="opacity-0 scale-95"
                                enterTo="opacity-100 scale-100"
                                leave="ease-in duration-150"
                                leaveFrom="opacity-100 scale-100"
                                leaveTo="opacity-0 scale-95"
                            >
                                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 shadow-2xl transition-all">
                                    <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center gap-2.5">
                                            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                                                <BellAlertIcon className="w-5 h-5" />
                                            </div>
                                            <Dialog.Title as="h3" className="text-base font-semibold text-slate-900 dark:text-white">
                                                Create Alert Rule
                                            </Dialog.Title>
                                        </div>
                                        <button
                                            onClick={() => setIsRuleModalOpen(false)}
                                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
                                        >
                                            <XMarkIcon className="w-5 h-5" />
                                        </button>
                                    </div>

                                    <form onSubmit={handleCreateRule} className="mt-4 space-y-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                                Rule Name
                                            </label>
                                            <input
                                                type="text"
                                                value={ruleName}
                                                onChange={(e) => setRuleName(e.target.value)}
                                                placeholder="e.g. Production Agent Offline"
                                                required
                                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                                Alert Condition / Type
                                            </label>
                                            <select
                                                value={ruleType}
                                                onChange={(e) => setRuleType(e.target.value)}
                                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                            >
                                                <option value="agent_offline">Host Agent Offline (Missed Heartbeats)</option>
                                                <option value="container_stopped">Container Stopped / Exited</option>
                                                <option value="resource_threshold">High Resource Threshold Spike</option>
                                            </select>
                                        </div>

                                        {ruleType === 'agent_offline' && (
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                                    Heartbeat Timeout (Minutes)
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="120"
                                                    value={timeoutMinutes}
                                                    onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
                                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                                />
                                                <p className="text-[11px] text-slate-400 mt-1">
                                                    Alert will fire if an agent fails to send a heartbeat within this time window.
                                                </p>
                                            </div>
                                        )}

                                        <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800 mt-6">
                                            <button
                                                type="button"
                                                onClick={() => setIsRuleModalOpen(false)}
                                                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={creatingRule}
                                                className="px-5 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl shadow-md hover:shadow-cyan-500/20 transition-all"
                                            >
                                                {creatingRule ? 'Creating...' : 'Save Rule'}
                                            </button>
                                        </div>
                                    </form>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>

            {/* DELETE CONFIRMATION MODAL */}
            <ConfirmModal
                isOpen={confirmDelete.isOpen}
                onClose={() => setConfirmDelete({ isOpen: false, id: 0, type: 'rule', title: '' })}
                onConfirm={executeDelete}
                title={`Delete ${confirmDelete.type === 'rule' ? 'Alert Rule' : 'Notification Channel'}`}
                message={`Are you sure you want to delete "${confirmDelete.title}"? This action cannot be undone.`}
                confirmText="Delete"
                isDestructive={true}
            />
        </div>
    );
};
