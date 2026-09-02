import React, { useState, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { parseLogLine, LogEntry } from '../utils/logParser';
import { 
    ClipboardDocumentListIcon 
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import { clsx } from 'clsx';

// Highlight key=value pairs
const HighlightedLogContent = React.memo(({ text }: { text: string }) => {
    const parts = useMemo(() => {
        const regex = /([a-zA-Z0-9_\-\.]+)=("(?:[^"\\]|\\.)*"|[^\s]+)/g;
        const result: React.ReactNode[] = [];
        let lastIndex = 0;
        let match;
        
        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                result.push(text.substring(lastIndex, match.index));
            }
            
            const key = match[1];
            const value = match[2];
            
            result.push(
                <span key={match.index} className="group/pair">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">{key}</span>
                    <span className="text-slate-400 dark:text-slate-500">=</span>
                    <span className="text-cyan-700 dark:text-cyan-300 group-hover/pair:text-cyan-600 dark:group-hover/pair:text-cyan-200 transition-colors">{value}</span>
                </span>
            );
            
            lastIndex = regex.lastIndex;
        }
        
        if (lastIndex < text.length) {
            result.push(text.substring(lastIndex)); 
        }
        
        return result.length > 0 ? result : [text];
    }, [text]);

    return <span className="whitespace-pre-wrap break-all font-mono text-[11px] leading-tight text-slate-800 dark:text-slate-200">{parts}</span>;
});

interface Props {
  logs: string[];
  filter?: string;
  dedup?: boolean;
  showTimestamp?: boolean;
}

const LogRow = React.memo(({ line, index, showTimestamp }: { line: string; index: number; showTimestamp?: boolean }) => {
    const [expanded, setExpanded] = useState(false);
    const entry: LogEntry | null = useMemo(() => {
        try {
            return parseLogLine(line, index);
        } catch (e) {
            console.error("Failed to parse log line:", e, line);
            return null;
        }
    }, [line, index]);

    // Format timestamp
    const formattedTime = useMemo(() => {
        if (!entry || !entry.timestamp) return '';
        try {
            if (typeof entry.timestamp !== 'string') return String(entry.timestamp);
            const date = new Date(entry.timestamp);
            if (isNaN(date.getTime())) return entry.timestamp;
            return date.toISOString().replace('T', ' ').replace('Z', '');
        } catch (e) {
            return entry.timestamp;
        }
    }, [entry?.timestamp]);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (entry?.fields) {
            navigator.clipboard.writeText(JSON.stringify(entry.fields, null, 2));
            toast.success("Log details copied");
        }
    };

    if (!entry) {
        return <div className="text-rose-600 dark:text-rose-400 py-1 px-2 border-b border-rose-200 dark:border-rose-900/50">Error parsing log line</div>;
    }

    const hasFields = entry.fields && Object.keys(entry.fields).length > 0;
    const dotColor = useMemo(() => {
        const l = (entry.level || '').toLowerCase();
        if (l.includes('err') || l.includes('fatal')) return 'bg-rose-500';
        if (l.includes('warn')) return 'bg-amber-500';
        if (l.includes('info')) return 'bg-emerald-500';
        return 'bg-slate-400 dark:bg-slate-500';
    }, [entry.level]);

    return (
        <div className="group border-b border-slate-200 dark:border-slate-800/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition-colors text-xs font-mono relative bg-white dark:bg-slate-950">
           {/* Context Menu Trigger */}
           <div className="absolute right-2 top-1 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 z-10 shadow-sm">
               <button onClick={handleCopy} className="p-1 hover:text-slate-900 dark:hover:text-white text-slate-500 dark:text-slate-400" title="Copy Log">
                   <ClipboardDocumentListIcon className="w-3.5 h-3.5" />
               </button>
           </div>

           {/* Summary Line */}
           <div 
               className="flex items-start py-1 px-2 cursor-pointer gap-3 min-h-[22px]"
               onClick={() => setExpanded(!expanded)}
           >
               {/* Timestamp Column */}
               {showTimestamp && (
                   <div className="text-blue-600 dark:text-blue-400 font-mono text-[10px] flex-shrink-0 w-36 whitespace-nowrap pt-0.5 select-none font-medium">
                       {formattedTime || '-'}
                   </div>
               )}

               {/* Level Dot */}
               <div className="pt-2 flex-shrink-0">
                   <div className={clsx("w-1.5 h-1.5 rounded-full", dotColor)} />
               </div>

               {/* Content */}
               <div className="flex-1 min-w-0 py-0.5">
                   <HighlightedLogContent text={entry.raw || entry.message} />
               </div>
           </div>

           {/* Expanded Detail View */}
           {expanded && hasFields && (
               <div className="pl-8 pr-4 pb-2 bg-slate-50 dark:bg-slate-900/50">
                   <div className="mt-1 border border-slate-200 dark:border-slate-700 rounded overflow-hidden shadow-sm">
                       <div className="bg-slate-100 dark:bg-slate-800/50 px-2 py-1 flex justify-between items-center border-b border-slate-200 dark:border-slate-700">
                           <span className="text-slate-600 dark:text-slate-400 font-bold text-[10px] uppercase tracking-wider">Log Details</span>
                           <button onClick={handleCopy} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white" title="Copy JSON">
                               <ClipboardDocumentListIcon className="w-3 h-3" />
                           </button>
                       </div>
                       <table className="w-full text-left border-collapse">
                           <tbody>
                               {Object.entries(entry.fields).map(([key, value]) => (
                                   <tr key={key} className="border-b border-slate-200 dark:border-slate-700/50 last:border-0 hover:bg-slate-100/50 dark:hover:bg-slate-800/30">
                                       <td className="py-1 px-2 text-cyan-700 dark:text-cyan-400 font-semibold w-32 align-top border-r border-slate-200 dark:border-slate-700/50">
                                           {key}
                                       </td>
                                       <td className="py-1 px-2 text-slate-800 dark:text-slate-300 break-all whitespace-pre-wrap">
                                            {value}
                                       </td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
               </div>
           )}
        </div>
    );
});

export const StructuredLogViewer = ({ logs, showTimestamp = true }: Props) => {
    return (
        <Virtuoso
            style={{ height: '100%', width: '100%' }}
            data={logs}
            totalCount={logs.length}
            itemContent={(index, line) => <LogRow index={index} line={line} showTimestamp={showTimestamp} />}
            followOutput={'auto'}
            alignToBottom
        />
    );
};
