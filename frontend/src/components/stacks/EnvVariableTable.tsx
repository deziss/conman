import React, { useState, useMemo } from 'react';
import { 
    PlusIcon, 
    TrashIcon, 
    EyeIcon, 
    EyeSlashIcon, 
    MagnifyingGlassIcon,
    CodeBracketIcon,
    TableCellsIcon,
    ClipboardDocumentIcon,
    CheckIcon
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import toast from 'react-hot-toast';

export interface EnvPair {
    id: string;
    key: string;
    value: string;
}

interface EnvVariableTableProps {
    envContent: string;
    onChange: (newContent: string) => void;
    readOnly?: boolean;
}

const SENSITIVE_KEY_PATTERNS = [
    'PASS', 'SECRET', 'KEY', 'TOKEN', 'AUTH', 'CRED', 'PRIVATE', 'CERT', 'DATABASE_URL'
];

export const parseEnvToPairs = (content: string): EnvPair[] => {
    const lines = content.split('\n');
    const pairs: EnvPair[] = [];
    let idx = 0;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx !== -1) {
            const key = line.slice(0, eqIdx).trim();
            const value = line.slice(eqIdx + 1);
            pairs.push({
                id: `env-${idx++}-${key}`,
                key,
                value
            });
        }
    }
    return pairs;
};

export const pairsToEnvString = (pairs: EnvPair[]): string => {
    return pairs
        .filter(p => p.key.trim() !== '')
        .map(p => `${p.key.trim()}=${p.value}`)
        .join('\n') + (pairs.length > 0 ? '\n' : '');
};

export const EnvVariableTable: React.FC<EnvVariableTableProps> = ({
    envContent,
    onChange,
    readOnly = false
}) => {
    const [mode, setMode] = useState<'table' | 'raw'>('table');
    const [searchQuery, setSearchQuery] = useState('');
    const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
    const [copied, setCopied] = useState(false);

    // Parse pairs from incoming string
    const pairs = useMemo(() => parseEnvToPairs(envContent), [envContent]);

    const isSensitive = (key: string): boolean => {
        const upper = key.toUpperCase();
        return SENSITIVE_KEY_PATTERNS.some(pat => upper.includes(pat));
    };

    const toggleReveal = (id: string) => {
        setRevealedKeys(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handlePairChange = (id: string, field: 'key' | 'value', newVal: string) => {
        const updated = pairs.map(p => {
            if (p.id === id) {
                return { ...p, [field]: newVal };
            }
            return p;
        });
        onChange(pairsToEnvString(updated));
    };

    const handleAddRow = () => {
        const newPair: EnvPair = {
            id: `env-${Date.now()}`,
            key: '',
            value: ''
        };
        const updated = [...pairs, newPair];
        onChange(pairsToEnvString(updated));
    };

    const handleDeleteRow = (id: string) => {
        const updated = pairs.filter(p => p.id !== id);
        onChange(pairsToEnvString(updated));
    };

    const handleCopyAll = () => {
        navigator.clipboard.writeText(envContent);
        setCopied(true);
        toast.success('Environment variables copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
    };

    const filteredPairs = useMemo(() => {
        if (!searchQuery.trim()) return pairs;
        const q = searchQuery.toLowerCase();
        return pairs.filter(p => 
            p.key.toLowerCase().includes(q) || p.value.toLowerCase().includes(q)
        );
    }, [pairs, searchQuery]);

    return (
        <div className="flex flex-col h-full bg-slate-900/60 rounded-xl border border-slate-700/60 overflow-hidden">
            {/* Header Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-800/80 border-b border-slate-700/80">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Environment Variables ({pairs.length})
                    </span>
                    <div className="flex items-center bg-slate-950/60 p-0.5 rounded-lg border border-slate-700/70">
                        <button
                            type="button"
                            onClick={() => setMode('table')}
                            className={clsx(
                                "flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                                mode === 'table' 
                                    ? "bg-indigo-600 text-white shadow-sm" 
                                    : "text-slate-400 hover:text-white"
                            )}
                        >
                            <TableCellsIcon className="w-3.5 h-3.5" />
                            <span>Table</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('raw')}
                            className={clsx(
                                "flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                                mode === 'raw' 
                                    ? "bg-indigo-600 text-white shadow-sm" 
                                    : "text-slate-400 hover:text-white"
                            )}
                        >
                            <CodeBracketIcon className="w-3.5 h-3.5" />
                            <span>Raw .env</span>
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {mode === 'table' && (
                        <div className="relative">
                            <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Filter variables..."
                                className="pl-8 pr-3 py-1 bg-slate-950/70 border border-slate-700/80 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-44 sm:w-56"
                            />
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleCopyAll}
                        className="flex items-center gap-1 px-2.5 py-1 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/70 rounded-lg text-xs text-slate-200 transition-colors"
                        title="Copy .env content"
                    >
                        {copied ? <CheckIcon className="w-3.5 h-3.5 text-emerald-400" /> : <ClipboardDocumentIcon className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
                    </button>

                    {!readOnly && mode === 'table' && (
                        <button
                            type="button"
                            onClick={handleAddRow}
                            className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-xs transition-colors shadow-sm"
                        >
                            <PlusIcon className="w-3.5 h-3.5" />
                            <span>Add Variable</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-auto min-h-0">
                {mode === 'table' ? (
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-950/60 sticky top-0 z-10 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            <tr>
                                <th className="py-2 px-3 w-5/12">Key</th>
                                <th className="py-2 px-3 w-6/12">Value</th>
                                {!readOnly && <th className="py-2 px-3 w-1/12 text-right">Action</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80 text-xs">
                            {filteredPairs.length === 0 ? (
                                <tr>
                                    <td colSpan={readOnly ? 2 : 3} className="py-8 text-center text-slate-500 italic">
                                        {searchQuery ? 'No matching variables found' : 'No environment variables set. Click "Add Variable" to create one.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredPairs.map((pair) => {
                                    const sensitive = isSensitive(pair.key);
                                    const revealed = revealedKeys[pair.id] ?? false;

                                    return (
                                        <tr key={pair.id} className="hover:bg-slate-800/40 transition-colors group">
                                            <td className="py-1.5 px-3 align-top">
                                                <input
                                                    type="text"
                                                    value={pair.key}
                                                    disabled={readOnly}
                                                    onChange={(e) => handlePairChange(pair.id, 'key', e.target.value)}
                                                    placeholder="VARIABLE_NAME"
                                                    className="w-full font-mono text-xs font-semibold text-indigo-300 bg-transparent border-b border-transparent focus:border-indigo-500 focus:bg-slate-950/40 focus:outline-none px-1 py-0.5 rounded transition-colors"
                                                />
                                            </td>
                                            <td className="py-1.5 px-3 align-top">
                                                <div className="relative flex items-center">
                                                    <input
                                                        type={sensitive && !revealed ? 'password' : 'text'}
                                                        value={pair.value}
                                                        disabled={readOnly}
                                                        onChange={(e) => handlePairChange(pair.id, 'value', e.target.value)}
                                                        placeholder="value"
                                                        className={clsx(
                                                            "w-full font-mono text-xs bg-transparent border-b border-transparent focus:border-indigo-500 focus:bg-slate-950/40 focus:outline-none px-1 py-0.5 rounded transition-colors",
                                                            sensitive ? "text-amber-200" : "text-slate-200",
                                                            sensitive ? "pr-7" : ""
                                                        )}
                                                    />
                                                    {sensitive && (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleReveal(pair.id)}
                                                            className="absolute right-1 text-slate-400 hover:text-slate-200 transition-colors p-0.5"
                                                            title={revealed ? "Hide secret" : "Reveal secret"}
                                                        >
                                                            {revealed ? <EyeSlashIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            {!readOnly && (
                                                <td className="py-1.5 px-3 align-middle text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteRow(pair.id)}
                                                        className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-rose-500/10 transition-colors"
                                                        title="Delete variable"
                                                    >
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                ) : (
                    <textarea
                        value={envContent}
                        disabled={readOnly}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="KEY=value&#10;DATABASE_URL=postgres://..."
                        rows={16}
                        className="w-full h-full p-4 font-mono text-xs bg-slate-950/80 text-emerald-300 placeholder-slate-600 focus:outline-none resize-none selection:bg-indigo-900"
                        spellCheck={false}
                    />
                )}
            </div>
        </div>
    );
};
