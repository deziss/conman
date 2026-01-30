import React, { useState, useMemo, useRef } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { LogEntry } from '../services/LogParser';
import { clsx } from 'clsx';
import { 
    ClipboardDocumentListIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

// --- Highlighter Component ---
const HighlightedContent = React.memo(({ text }: { text: string; }) => {
    const parts = useMemo(() => {
        if (!text) return null;
        
        // Complex Regex: Key=Value OR SearchTerm
        // We do key-value first, then search term? 
        // Or single pass? Single pass is hard if they overlap.
        // Let's do Key-Value highlighting first because that's the "syntax".
        // Search term highlighting usually via mark.js or simple split.
        
        // Regex for key=value
        const kvRegex = /([a-zA-Z0-9_\-\.]+)=("(?:[^"\\]|\\.)*"|[^\s]+)/g;
        
        const result: React.ReactNode[] = [];
        let lastIndex = 0;
        let match;
        
        while ((match = kvRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                 result.push(text.substring(lastIndex, match.index));
            }
            
            const key = match[1];
            const value = match[2];
            
            result.push(
                <span key={`kv-${match.index}`} className="group/pair">
                    <span className="text-slate-500 font-medium">{key}</span>
                    <span className="text-slate-600">=</span>
                    <span className="text-cyan-300 group-hover/pair:text-cyan-200">{value}</span>
                </span>
            );
            
            lastIndex = kvRegex.lastIndex;
        }
        
        if (lastIndex < text.length) {
            result.push(text.substring(lastIndex));
        }
        
        // TODO: Apply Search Highlight on top of result? 
        // React node manipulation is tricky. 
        // For MVP, we stick to Key-Value highlight. 
        // If searchTerm exists, we might need a simpler view or just CSS highlight?
        
        return result.length > 0 ? result : [text];
    }, [text]);

    return <span className="whitespace-pre-wrap break-all">{parts}</span>;
});

// --- Log Row Component ---
const LogRow = React.memo(({ entry, style }: { entry: LogEntry; index: number; style?: React.CSSProperties }) => {
    const [expanded, setExpanded] = useState(false);
    
    // Level styling
    const levelColor = useMemo(() => {
        switch (entry.level) {
            case 'error': return 'bg-rose-500 text-rose-500';
            case 'warn': return 'bg-amber-500 text-amber-500';
            case 'info': return 'bg-emerald-500 text-emerald-500';
            case 'debug': return 'bg-blue-500 text-blue-500';
            default: return 'bg-slate-500 text-slate-500';
        }
    }, [entry.level]);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
        toast.success("Log copied");
    };

    const hasFields = Object.keys(entry.fields).length > 0;

    return (
        <div className="group border-b border-slate-800/40 hover:bg-slate-800/40 text-[11px] font-mono leading-relaxed" style={style}>
            {/* Main Line */}
            <div 
                className="flex items-start py-0.5 px-3 cursor-pointer gap-3 min-h-[22px]"
                onClick={() => setExpanded(!expanded)}
            >
                {/* 1. Timestamp */}
                <div className="flex-shrink-0 w-36 text-blue-400/80 pt-0.5 select-text">
                    {entry.timestamp ? entry.timestamp.replace('T', ' ').replace('Z', '') : '-'}
                </div>

                {/* 2. Level Indicator */}
                <div className="pt-2 flex-shrink-0">
                    <div className={clsx("w-1.5 h-1.5 rounded-full", levelColor.split(' ')[0])} />
                </div>

                {/* 3. Message/Content */}
                <div className="flex-1 min-w-0 pt-0.5 text-slate-300">
                    <HighlightedContent text={entry.message || entry.raw} />
                </div>
                
                {/* Context Actions (Hover) */}
                <div className="w-6 opacity-0 group-hover:opacity-100 transition-opacity flex justify-end">
                    <button onClick={handleCopy} className="text-slate-500 hover:text-white" title="Copy">
                        <ClipboardDocumentListIcon className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Expanded Details */}
            {expanded && (
                <div className="pl-44 pr-4 pb-2 bg-slate-900/40">
                    {hasFields ? (
                        <div className="mt-1 border border-slate-800 rounded bg-slate-950/50 p-2">
                             <table className="w-full text-left border-collapse">
                                <tbody>
                                    {Object.entries(entry.fields).map(([key, value]) => (
                                        <tr key={key} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30">
                                            <td className="py-1 px-2 text-cyan-500/80 font-semibold w-32 align-top border-r border-slate-800/50 select-text">
                                                {key}
                                            </td>
                                            <td className="py-1 px-2 text-slate-300 break-all whitespace-pre-wrap select-text">
                                                {value}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                             </table>
                        </div>
                    ) : (
                        <div className="mt-1 text-slate-500 italic px-2">No structured fields found.</div>
                    )}
                </div>
            )}
        </div>
    );
});

// --- Main Viewer Component ---
interface RichLogViewerProps {
    logs: LogEntry[];
    follow?: boolean;
}

export const RichLogViewer = ({ logs, follow = true }: RichLogViewerProps) => {
    const listRef = useRef<VirtuosoHandle>(null);

    // Auto-scroll logic if needed
    // Virtuoso handles followOutput="auto"
    
    return (
        <div className="w-full h-full bg-[#0d1117]"> {/* Custom dark bg */}
            <Virtuoso
                ref={listRef}
                style={{ height: '100%', width: '100%' }}
                data={logs}
                totalCount={logs.length}
                itemContent={(index, entry) => <LogRow index={index} entry={entry} />}
                followOutput={follow ? "auto" : false}
                alignToBottom
                // Performance tuning
                overscan={200} 
            />
        </div>
    );
};
