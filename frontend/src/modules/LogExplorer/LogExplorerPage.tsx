import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { LogStream } from './services/LogStream';
import { LogParser, type LogEntry } from './services/LogParser';
import { RichLogViewer } from './components/RichLogViewer';
import { 
    ChevronLeftIcon, 
    PlayIcon, 
    PauseIcon, 
    TrashIcon, 
    MagnifyingGlassIcon
} from '@heroicons/react/24/solid';
import { ErrorBoundary } from '../../components/ErrorBoundary';

export const LogExplorerPage = () => {
    const { id: containerId } = useParams<{ id: string }>();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isPlaying, setIsPlaying] = useState(true);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
    const [filter, setFilter] = useState('');

    const streamRef = useRef<LogStream | null>(null);

    // Filter Logic
    // We can filter in memory for now. 
    // Ideally we should keep raw buffer and filtered buffer separate.
    const logsBuffer = useRef<LogEntry[]>([]);
    const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);

    const handleLogLine = useCallback((line: string) => {
        // Parse Immediately
        // Optimization: Batch updates? 
        // For < 100 log/s React state is fine.
        
        // To prevent freezing on massive flood, we might need a buffer flushing mechanism.
        // But for "Proper" module let's start simple.
        
        const entry = LogParser.parse(line, logsBuffer.current.length);
        logsBuffer.current.push(entry);
        
        if (isPlaying) {
             setLogs(prev => {
                 const next = [...prev, entry];
                 if (next.length > 10000) return next.slice(-10000); // Limit 10k
                 return next;
             });
        }
    }, [isPlaying]);

    useEffect(() => {
        if (!containerId) return;
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const token = localStorage.getItem('token');
        const url = `${protocol}//${window.location.host}/api/v1/docker/containers/${containerId}/logs?token=${token}`;

        streamRef.current = new LogStream(
            url,
            handleLogLine,
            () => setStatus('error')
        );
        
        streamRef.current.connect();
        setStatus('connected');

        return () => {
            streamRef.current?.disconnect();
        };
    }, [containerId, handleLogLine]);

    // Apply Filter
    useEffect(() => {
        // Debounce or immediate?
        if (!filter) {
            setFilteredLogs(logs);
        } else {
            const lower = filter.toLowerCase();
            // Filter 10k logs might take 10-50ms. acceptable.
            const matches = logs.filter(l => 
                l.raw.toLowerCase().includes(lower) || 
                l.message.toLowerCase().includes(lower)
            );
            setFilteredLogs(matches);
        }
    }, [logs, filter]);


    const handleClear = () => {
        logsBuffer.current = [];
        setLogs([]);
    };

    if (!containerId) return <div>Invalid Container ID</div>;

    return (
        <div className="flex flex-col h-screen bg-[#0d1117] text-slate-300">
             {/* Header */}
             <div className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-slate-800 shadow-sm z-10">
                 <div className="flex items-center space-x-4">
                     <Link to="/containers" className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 transition-colors">
                         <ChevronLeftIcon className="w-5 h-5" />
                     </Link>
                     <div>
                         <h1 className="text-sm font-semibold text-slate-200">
                             Log Explorer <span className="text-slate-500">/</span> <span className="font-mono text-cyan-400">{containerId.substring(0, 12)}</span>
                         </h1>
                         <div className="flex items-center space-x-2 text-[10px] space-x-2 mt-0.5">
                              <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-rose-500'}`} />
                              <span className="text-slate-500 uppercase font-bold tracking-wider">{status === 'connected' ? 'Live Stream' : 'Disconnected'}</span>
                              <span className="text-slate-600">|</span>
                              <span className="text-slate-500">{filteredLogs.length.toLocaleString()} events</span>
                         </div>
                     </div>
                 </div>

                 {/* Tools */}
                 <div className="flex items-center space-x-3">
                     {/* Search */}
                     <div className="relative group">
                         <MagnifyingGlassIcon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-cyan-400 transition-colors" />
                         <input 
                            type="text" 
                            placeholder="Filter logs..." 
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="bg-[#0d1117] border border-slate-700/50 rounded-md py-1.5 pl-9 pr-3 text-xs w-64 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all placeholder:text-slate-600"
                         />
                     </div>
                     
                     <div className="h-5 w-px bg-slate-800 mx-2" />

                     <button onClick={() => setIsPlaying(!isPlaying)} className={`p-1.5 rounded-md transition-colors ${isPlaying ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                         {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
                     </button>
                     <button onClick={handleClear} className="p-1.5 rounded-md hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-colors">
                         <TrashIcon className="w-4 h-4" />
                     </button>
                 </div>
             </div>

             {/* Main Content */}
             <div className="flex-1 min-h-0 relative">
                 <ErrorBoundary name="LogExplorer">
                     <RichLogViewer logs={filteredLogs} follow={isPlaying} />
                 </ErrorBoundary>
             </div>
        </div>
    );
};
