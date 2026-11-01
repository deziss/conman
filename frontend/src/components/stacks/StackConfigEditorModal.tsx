import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
    XMarkIcon, 
    ArrowPathIcon, 
    DocumentTextIcon, 
    KeyIcon, 
    CheckCircleIcon,
    ExclamationTriangleIcon,
    ShieldCheckIcon,
    CommandLineIcon
} from '@heroicons/react/24/solid';
import { EnvVariableTable, parseEnvToPairs } from './EnvVariableTable';
import api from '../../services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface StackConfigEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    hostId: string;
    stackName: string;
    onReconciled?: () => void;
}

export const StackConfigEditorModal: React.FC<StackConfigEditorModalProps> = ({
    isOpen,
    onClose,
    hostId,
    stackName,
    onReconciled
}) => {
    const [activeTab, setActiveTab] = useState<'compose' | 'env' | 'diff'>('env');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [reconcileOutput, setReconcileOutput] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Original and edited content
    const [originalCompose, setOriginalCompose] = useState('');
    const [originalEnv, setOriginalEnv] = useState('');
    const [composeContent, setComposeContent] = useState('');
    const [envContent, setEnvContent] = useState('');
    const [targetService, setTargetService] = useState('');
    const [availableServices, setAvailableServices] = useState<string[]>([]);

    useEffect(() => {
        if (!isOpen || !hostId || !stackName) return;

        const fetchConfig = async () => {
            setLoading(true);
            setErrorMsg(null);
            setReconcileOutput(null);
            try {
                const { data } = await api.get(`/agents/${hostId}/stacks/${stackName}/config`);
                const comp = data.compose_content || '';
                const env = data.env_content || '';
                setOriginalCompose(comp);
                setOriginalEnv(env);
                setComposeContent(comp);
                setEnvContent(env);

                // Extract services from compose YAML
                const svcMatches = [...comp.matchAll(/^\s{2}([a-zA-Z0-9_-]+):/gm)];
                const svcList = svcMatches.map(m => m[1]);
                setAvailableServices(svcList);
            } catch (err: any) {
                console.error('Failed to load stack configuration', err);
                const msg = err.response?.data?.error || err.response?.data || err.message;
                setErrorMsg(`Failed to load stack config: ${msg}`);
                toast.error('Could not load stack configuration');
            } finally {
                setLoading(false);
            }
        };

        fetchConfig();
    }, [isOpen, hostId, stackName]);

    // Handle Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen && !saving) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, saving, onClose]);

    // Compute diff stats
    const diffSummary = useMemo(() => {
        const origPairs = parseEnvToPairs(originalEnv);
        const currPairs = parseEnvToPairs(envContent);

        const origMap = new Map(origPairs.map(p => [p.key, p.value]));
        const currMap = new Map(currPairs.map(p => [p.key, p.value]));

        const added: string[] = [];
        const modified: { key: string; from: string; to: string }[] = [];
        const removed: string[] = [];

        for (const [k, v] of currMap.entries()) {
            if (!origMap.has(k)) {
                added.push(k);
            } else if (origMap.get(k) !== v) {
                modified.push({ key: k, from: origMap.get(k) || '', to: v });
            }
        }

        for (const [k] of origMap.entries()) {
            if (!currMap.has(k)) {
                removed.push(k);
            }
        }

        const composeModified = originalCompose.trim() !== composeContent.trim();

        return {
            added,
            modified,
            removed,
            composeModified,
            hasChanges: added.length > 0 || modified.length > 0 || removed.length > 0 || composeModified
        };
    }, [originalEnv, envContent, originalCompose, composeContent]);

    const handleSaveAndReconcile = async () => {
        setSaving(true);
        setErrorMsg(null);
        setReconcileOutput(null);

        try {
            const payload = {
                name: stackName,
                compose_content: composeContent,
                env_content: envContent,
                target_service: targetService || undefined,
            };

            const { data } = await api.post(`/agents/${hostId}/stacks/${stackName}/config`, payload);
            setReconcileOutput(data.output || 'Reconciliation succeeded smoothly.');
            setOriginalCompose(composeContent);
            setOriginalEnv(envContent);
            toast.success(`Stack ${stackName} converged & reconfigured successfully!`);

            if (onReconciled) {
                onReconciled();
            }
        } catch (err: any) {
            console.error('Reconciliation failed', err);
            const errResp = err.response?.data;
            const message = errResp?.error || errResp?.output || err.message;
            setErrorMsg(message);
            if (errResp?.result?.output) {
                setReconcileOutput(errResp.result.output);
            }
            toast.error('Reconciliation failed. Configuration was safely rolled back.');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
            <div 
                className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden text-slate-100"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                            <CommandLineIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center space-x-2">
                                <h2 className="text-lg font-bold tracking-tight text-white">{stackName}</h2>
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Live Converged
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Modify live compose manifest and .env with automatic rolling convergence & backup rollback
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center space-x-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Sub-Header Tabs & Selector */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 border-b border-slate-800/80 bg-slate-900/90">
                    <div className="flex items-center space-x-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
                        <button
                            type="button"
                            onClick={() => setActiveTab('env')}
                            className={clsx(
                                "flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                                activeTab === 'env'
                                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                            )}
                        >
                            <KeyIcon className="w-3.5 h-3.5" />
                            <span>Environment (.env)</span>
                            {diffSummary.added.length + diffSummary.modified.length + diffSummary.removed.length > 0 && (
                                <span className="ml-1 px-1.5 py-0.2 bg-indigo-950 text-indigo-300 rounded text-[10px] font-bold">
                                    {diffSummary.added.length + diffSummary.modified.length + diffSummary.removed.length}
                                </span>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('compose')}
                            className={clsx(
                                "flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                                activeTab === 'compose'
                                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                            )}
                        >
                            <DocumentTextIcon className="w-3.5 h-3.5" />
                            <span>Compose Manifest</span>
                            {diffSummary.composeModified && (
                                <span className="ml-1 w-2 h-2 rounded-full bg-amber-400" />
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('diff')}
                            className={clsx(
                                "flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                                activeTab === 'diff'
                                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                            )}
                        >
                            <ShieldCheckIcon className="w-3.5 h-3.5" />
                            <span>Review Changes</span>
                            {diffSummary.hasChanges && (
                                <span className="ml-1 px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded text-[10px] font-bold">
                                    Pending
                                </span>
                            )}
                        </button>
                    </div>

                    {availableServices.length > 0 && (
                        <div className="flex items-center space-x-2 text-xs">
                            <span className="text-slate-400">Target Service:</span>
                            <select
                                value={targetService}
                                onChange={(e) => setTargetService(e.target.value)}
                                className="bg-slate-950/80 border border-slate-700/80 text-slate-200 text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:border-indigo-500"
                            >
                                <option value="">All Services (Full Stack)</option>
                                {availableServices.map(svc => (
                                    <option key={svc} value={svc}>{svc}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Main Content Area */}
                <div className="flex-1 p-6 overflow-hidden min-h-0 bg-slate-950/30">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full space-y-3">
                            <ArrowPathIcon className="w-8 h-8 text-indigo-500 animate-spin" />
                            <p className="text-sm text-slate-400">Reading stack state and configurations...</p>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col">
                            {activeTab === 'env' && (
                                <EnvVariableTable
                                    envContent={envContent}
                                    onChange={setEnvContent}
                                    readOnly={saving}
                                />
                            )}

                            {activeTab === 'compose' && (
                                <div className="h-full flex flex-col rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950/80">
                                    <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-400">
                                        <span className="font-mono font-medium text-slate-300">docker-compose.yml</span>
                                        <span className="text-[11px] text-slate-500">Persistent Host State</span>
                                    </div>
                                    <textarea
                                        value={composeContent}
                                        disabled={saving}
                                        onChange={(e) => setComposeContent(e.target.value)}
                                        rows={20}
                                        className="w-full flex-1 p-4 font-mono text-xs text-indigo-100 bg-transparent focus:outline-none resize-none leading-relaxed selection:bg-indigo-900"
                                        spellCheck={false}
                                    />
                                </div>
                            )}

                            {activeTab === 'diff' && (
                                <div className="h-full overflow-y-auto space-y-4 pr-1">
                                    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
                                        <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center space-x-2">
                                            <ShieldCheckIcon className="w-4 h-4 text-emerald-400" />
                                            <span>Convergence Safety Guarantee</span>
                                        </h3>
                                        <p className="text-xs text-slate-400 leading-relaxed">
                                            Applying these changes will atomically write to host persistent storage (<code className="text-indigo-300">/var/lib/conman/stacks/{stackName}</code>) and execute declarative compose convergence. If docker compose reports a failure, the previous configuration is restored immediately from backup.
                                        </p>
                                    </div>

                                    {/* Diff Summary */}
                                    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3">
                                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Summary of Changes</h4>
                                        {!diffSummary.hasChanges ? (
                                            <p className="text-xs text-slate-500 italic">No configuration modifications detected.</p>
                                        ) : (
                                            <ul className="text-xs space-y-2">
                                                {diffSummary.composeModified && (
                                                    <li className="flex items-center space-x-2 text-amber-400">
                                                        <span className="font-mono font-bold">•</span>
                                                        <span>Manifest: <code>docker-compose.yml</code> was modified.</span>
                                                    </li>
                                                )}
                                                {diffSummary.added.map(k => (
                                                    <li key={k} className="flex items-center space-x-2 text-emerald-400 font-mono">
                                                        <span>+</span>
                                                        <span>Added variable: <strong>{k}</strong></span>
                                                    </li>
                                                ))}
                                                {diffSummary.modified.map(m => (
                                                    <li key={m.key} className="flex items-center space-x-2 text-amber-300 font-mono">
                                                        <span>~</span>
                                                        <span>Modified variable: <strong>{m.key}</strong></span>
                                                    </li>
                                                ))}
                                                {diffSummary.removed.map(k => (
                                                    <li key={k} className="flex items-center space-x-2 text-rose-400 font-mono">
                                                        <span>-</span>
                                                        <span>Removed variable: <strong>{k}</strong></span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>

                                    {reconcileOutput && (
                                        <div className="p-4 rounded-xl border border-slate-800 bg-slate-950 font-mono text-xs text-slate-300">
                                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Convergence Engine Logs</div>
                                            <pre className="whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">{reconcileOutput}</pre>
                                        </div>
                                    )}

                                    {errorMsg && (
                                        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
                                            <div className="flex items-center space-x-2 font-bold mb-1">
                                                <ExclamationTriangleIcon className="w-4 h-4 text-rose-400" />
                                                <span>Error during reconfiguration</span>
                                            </div>
                                            <pre className="whitespace-pre-wrap font-mono mt-2">{errorMsg}</pre>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/40">
                    <div className="flex items-center space-x-2 text-xs text-slate-400">
                        <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                        <span>Persists across <code className="text-slate-300">docker restart</code> & host reboots</span>
                    </div>

                    <div className="flex items-center space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            onClick={handleSaveAndReconcile}
                            disabled={saving || loading || !diffSummary.hasChanges}
                            className={clsx(
                                "flex items-center space-x-2 px-5 py-2 text-xs font-bold rounded-xl transition-all shadow-lg",
                                !diffSummary.hasChanges || saving
                                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98]"
                            )}
                        >
                            {saving ? (
                                <>
                                    <ArrowPathIcon className="w-4 h-4 animate-spin text-white" />
                                    <span>Converging Stack...</span>
                                </>
                            ) : (
                                <>
                                    <ShieldCheckIcon className="w-4 h-4" />
                                    <span>Save & Live Reconcile</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
