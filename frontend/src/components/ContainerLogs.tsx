import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { 
    MagnifyingGlassIcon, 
    ArrowDownTrayIcon, 
    PauseIcon, 
    PlayIcon, 
    TrashIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    AdjustmentsHorizontalIcon,
    ClockIcon,
    Bars3BottomLeftIcon,
    TableCellsIcon,
    CommandLineIcon,
    ChevronDoubleDownIcon,
    ChevronDoubleUpIcon,
    ExclamationTriangleIcon,
    InformationCircleIcon,
    BugAntIcon,
    XCircleIcon
} from '@heroicons/react/24/solid';
import { toast } from 'react-hot-toast';
import { clsx } from 'clsx';
import 'xterm/css/xterm.css';
import { StructuredLogViewer } from './StructuredLogViewer';

interface ContainerLogsProps {
  containerId: string;
  agentId?: string;
}

// Helper to format ISO strings
const formatTimestamp = (iso: string) => {
    try {
        const date = new Date(iso);
        return date.toISOString().replace('T', ' ').replace('Z', '');
    } catch (e) {
        return iso; 
    }
};

// ANSI Colors
const ANSI = {
    RESET: '\x1b[0m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    RED: '\x1b[31m',
    BLUE: '\x1b[34m',
    CYAN: '\x1b[36m',
    GRAY: '\x1b[90m',
    BOLD: '\x1b[1m',
    MAGENTA: '\x1b[35m',
};

// Log Level Detection
type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'unknown';

const detectLogLevel = (line: string): LogLevel => {
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('err') || lower.includes('fatal') || lower.includes('crit')) return 'error';
    if (lower.includes('warn') || lower.includes('warning')) return 'warn';
    if (lower.includes('info')) return 'info';
    if (lower.includes('debug') || lower.includes('trace')) return 'debug';
    return 'unknown';
};

const getLevelColor = (level: LogLevel) => {
    switch (level) {
        case 'error': return ANSI.RED;
        case 'warn': return ANSI.YELLOW;
        case 'info': return ANSI.GREEN;
        case 'debug': return ANSI.BLUE;
        default: return ANSI.RESET;
    }
};

// Tail options
const TAIL_OPTIONS = [
    { value: '100', label: '100 lines' },
    { value: '500', label: '500 lines' },
    { value: '1000', label: '1K lines' },
    { value: '5000', label: '5K lines' },
    { value: '10000', label: '10K lines' },
    { value: 'all', label: 'All logs' },
];

// Time range options
const TIME_RANGES = [
    { value: '', label: 'No time filter' },
    { value: '5m', label: 'Last 5 min' },
    { value: '15m', label: 'Last 15 min' },
    { value: '1h', label: 'Last 1 hour' },
    { value: '6h', label: 'Last 6 hours' },
    { value: '24h', label: 'Last 24 hours' },
];

export const ContainerLogs = (props: ContainerLogsProps) => {
  const { containerId, agentId } = props;
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  
  // State
  const [isPlaying, setIsPlaying] = useState(true);
  const isPlayingRef = useRef(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [grepTerm, setGrepTerm] = useState('');
  const grepTermRef = useRef('');
  const levelFiltersRef = useRef<Record<string, boolean>>({ error: true, warn: true, info: true, debug: true, unknown: true });
  const showTimestampsRef = useRef(true);
  const termReadyRef = useRef(false);
  
  // Options
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [dedup, setDedup] = useState(false);
  const [viewMode, setViewMode] = useState<'raw' | 'table'>('raw');
  
  // Grafana-style controls
  const [tailCount, setTailCount] = useState('1000');
  const [timeRange, setTimeRange] = useState('');
  const [levelFilters, setLevelFilters] = useState<Record<LogLevel, boolean>>({
      error: true,
      warn: true,
      info: true,
      debug: true,
      unknown: true,
  });

  // Buffers
  const logBufferRef = useRef<string[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<string[]>([]);
  const [totalLines, setTotalLines] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);
  const processedBufferRef = useRef<Set<string>>(new Set()); 
  
  // Level counts
  const [levelCounts, setLevelCounts] = useState<Record<LogLevel, number>>({
      error: 0, warn: 0, info: 0, debug: 0, unknown: 0
  });

  // Stable refs for filter state — read in renderLogs without stale closures
  const dedupRef = useRef(false);
  const viewModeRef = useRef<'raw' | 'table'>('raw');

  // Toggle level filter — updates both state (for display) and ref (for renderLogs)
  const toggleLevel = (level: LogLevel) => {
      setLevelFilters(prev => {
          const next = { ...prev, [level]: !prev[level] };
          levelFiltersRef.current = next;
          reRenderLogs(next);
          return next;
      });
  };

  // renderLogs: reads filter state from refs so it's always current.
  // Called ONLY explicitly (filter changes, resume from pause). Never auto-fires.
  const reRenderLogs = (overrideLevelFilters?: Record<string, boolean>) => {
      if (!xtermRef.current) return;

      const term = xtermRef.current;
      term.clear();
      processedBufferRef.current.clear();

      const filters = overrideLevelFilters ?? levelFiltersRef.current;
      const buffer = logBufferRef.current;
      let renderedCount = 0;
      const counts: Record<LogLevel, number> = { error: 0, warn: 0, info: 0, debug: 0, unknown: 0 };

      for (const rawLine of buffer) {
          if (!rawLine.trim()) continue;

          let message = rawLine;
          const match = rawLine.match(/^(\d{4}-\d{2}-\d{2}T\S+) ([\s\S]*)/);
          if (match) message = match[2];

          const level = detectLogLevel(message);
          counts[level]++;

          if (!filters[level]) continue;
          if (grepTermRef.current && !rawLine.toLowerCase().includes(grepTermRef.current.toLowerCase())) continue;
          if (dedupRef.current) {
              const content = rawLine.substring(31);
              if (processedBufferRef.current.has(content)) continue;
              processedBufferRef.current.add(content);
          }

          let outputLine = '';
          if (showTimestampsRef.current && match) {
              outputLine += `${ANSI.GRAY}${formatTimestamp(match[1])}${ANSI.RESET} `;
          }
          outputLine += `${getLevelColor(level)}${message}${ANSI.RESET}`;
          term.writeln(outputLine);
          renderedCount++;
      }

      setTotalLines(buffer.length);
      setVisibleLines(renderedCount);
      setLevelCounts(counts);

      // Update table view too
      if (viewModeRef.current === 'table') {
          setFilteredLogs(buffer.filter(rawLine => {
              if (!rawLine.trim()) return false;
              let message = rawLine;
              const match = rawLine.match(/^(\d{4}-\d{2}-\d{2}T\S+) ([\s\S]*)/);
              if (match) message = match[2];
              const level = detectLogLevel(message);
              if (!filters[level]) return false;
              if (grepTermRef.current && !rawLine.toLowerCase().includes(grepTermRef.current.toLowerCase())) return false;
              return true;
          }));
      }
  };

  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'closed' | 'error'>('connecting');
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track current connection params so reconnect uses latest values
  const connectParamsRef = useRef({ containerId, tailCount, timeRange, agentId });

  // Keep params ref in sync without causing reconnect
  useEffect(() => {
    connectParamsRef.current = { containerId, tailCount, timeRange, agentId };
  });

  const connectLogs = useCallback(() => {
    if (!termReadyRef.current) return;

    const { containerId: cid, tailCount: tail, timeRange: tr, agentId: aid } = connectParamsRef.current;
    if (!aid || !cid) return;

    // Cancel any pending reconnect
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Close existing socket cleanly
    if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
      socketRef.current.onclose = null; // prevent reconnect loop from old socket
      socketRef.current.close();
    }

    setWsStatus('connecting');

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = localStorage.getItem('token') || '';

    const params = new URLSearchParams({ token, tail });
    if (tr) params.set('since', tr);

    const wsUrl = `${wsProtocol}//${window.location.host}/api/v1/agents/${aid}/containers/${cid}/logs?${params}`;
    let socket: WebSocket;

    try {
      socket = new WebSocket(wsUrl);
    } catch (err) {
      xtermRef.current?.writeln(`${ANSI.RED}--- Failed to open WebSocket: ${err} ---${ANSI.RESET}`);
      setWsStatus('error');
      return;
    }

    socketRef.current = socket;

    socket.onopen = () => {
      setWsStatus('connected');
      fitAddonRef.current?.fit();
      xtermRef.current?.clear();
      logBufferRef.current = [];
      setTotalLines(0);
      setVisibleLines(0);
      xtermRef.current?.writeln(`${ANSI.GREEN}--- Connected (tail=${tail}${tr ? `, since=${tr}` : ''}) ---${ANSI.RESET}`);
    };

    socket.onmessage = (event) => {
      if (!xtermRef.current) return;

      const handleData = (data: string) => {
        const lines = data.split('\n');
        for (const line of lines) {
          if (line) logBufferRef.current.push(line);
        }
        if (logBufferRef.current.length > 50000) {
          logBufferRef.current = logBufferRef.current.slice(-50000);
        }

        if (isPlayingRef.current) {
          for (const rawLine of lines) {
            if (!rawLine.trim()) continue;

            let message = rawLine;
            const match = rawLine.match(/^(\d{4}-\d{2}-\d{2}T\S+) ([\s\S]*)/);
            if (match) message = match[2];

            const level = detectLogLevel(message);
            if (!levelFiltersRef.current[level]) continue;
            if (grepTermRef.current && !rawLine.toLowerCase().includes(grepTermRef.current.toLowerCase())) continue;

            let outputLine = '';
            if (showTimestampsRef.current && match) {
              outputLine += `${ANSI.GRAY}${formatTimestamp(match[1])}${ANSI.RESET} `;
            }
            outputLine += `${getLevelColor(level)}${message}${ANSI.RESET}`;
            xtermRef.current?.writeln(outputLine);
          }
          setTotalLines(logBufferRef.current.length);
        }
      };

      if (typeof event.data === 'string') {
        handleData(event.data);
      } else {
        const reader = new FileReader();
        reader.onload = () => handleData(reader.result as string);
        reader.readAsText(event.data);
      }
    };

    socket.onerror = () => {
      setWsStatus('error');
    };

    socket.onclose = (ev) => {
      setWsStatus('closed');
      // Don't auto-reconnect if the component unmounted (termReadyRef cleared)
      if (!termReadyRef.current) return;
      // Don't reconnect on clean close (code 1000 = normal, 1001 = going away)
      const msg = ev.wasClean ? `closed (${ev.code})` : `lost (${ev.code})`;
      xtermRef.current?.writeln(`\r\n${ANSI.YELLOW}--- Stream ${msg}, reconnecting in 3s... ---${ANSI.RESET}`);
      reconnectTimerRef.current = setTimeout(() => {
        if (termReadyRef.current) connectLogs();
      }, 3000);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize XTerm
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#22d3ee',
        selectionBackground: 'rgba(34, 211, 238, 0.3)',
      },
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.4,
      cursorBlink: false,
      cursorStyle: 'bar',
      disableStdin: true,
      scrollback: 50000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    termReadyRef.current = true;

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      termReadyRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
      term.dispose();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Initial connect + reconnect when params change
  useEffect(() => {
    connectLogs();
  }, [connectLogs, containerId, tailCount, timeRange, agentId]);

  // Periodic table update (only when in table mode)
  useEffect(() => {
      if (viewMode !== 'table') return;
      const interval = setInterval(() => reRenderLogs(), 1000);
      return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  const handleSearchNext = () => searchAddonRef.current?.findNext(searchTerm);
  const handleSearchPrev = () => searchAddonRef.current?.findPrevious(searchTerm);

  const handleClear = () => {
    xtermRef.current?.clear();
    logBufferRef.current = [];
    setFilteredLogs([]);
    setTotalLines(0);
    setVisibleLines(0);
    toast.success("Logs cleared");
  };

  const handleDownload = () => {
     if (!xtermRef.current) return;
     const blob = new Blob(logBufferRef.current.map(l => l + '\n'), { type: 'text/plain' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `${containerId.substring(0, 12)}-${new Date().toISOString().split('T')[0]}.log`;
     a.click();
     URL.revokeObjectURL(url);
     toast.success("Download started");
  };

  const scrollToBottom = () => {
      xtermRef.current?.scrollToBottom();
  };

  const scrollToTop = () => {
      xtermRef.current?.scrollToLine(0);
  };

  const togglePause = () => {
      const next = !isPlaying;
      setIsPlaying(next);
      isPlayingRef.current = next;
      if (!next) {
          // Pausing — nothing to do
      } else {
          // Resuming — re-render buffer so any missed lines show
          reRenderLogs();
      }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-lg overflow-hidden border border-slate-800 shadow-xl">
      {/* Top Toolbar: Grafana-style controls */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 gap-3">
         
         {/* Left: Tail & Time Selectors */}
         <div className="flex items-center space-x-2">
             {/* Tail Selector */}
             <select 
                 value={tailCount}
                 onChange={(e) => setTailCount(e.target.value)}
                 className="bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 px-2 py-1.5 focus:outline-none focus:border-cyan-500"
             >
                 {TAIL_OPTIONS.map(opt => (
                     <option key={opt.value} value={opt.value}>{opt.label}</option>
                 ))}
             </select>

             {/* Time Range */}
             <select 
                 value={timeRange}
                 onChange={(e) => setTimeRange(e.target.value)}
                 className="bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 px-2 py-1.5 focus:outline-none focus:border-cyan-500"
             >
                 {TIME_RANGES.map(opt => (
                     <option key={opt.value} value={opt.value}>{opt.label}</option>
                 ))}
             </select>
         </div>

         {/* Center: Level Filter Pills */}
         <div className="flex items-center space-x-1">
             <button 
                 onClick={() => toggleLevel('error')}
                 className={clsx(
                     "flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-all",
                     levelFilters.error 
                         ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" 
                         : "bg-slate-800 text-slate-500 border border-slate-700 opacity-50"
                 )}
             >
                 <XCircleIcon className="w-3 h-3" />
                 <span>ERR</span>
                 {levelCounts.error > 0 && <span className="ml-1 text-[10px] opacity-75">({levelCounts.error})</span>}
             </button>
             <button 
                 onClick={() => toggleLevel('warn')}
                 className={clsx(
                     "flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-all",
                     levelFilters.warn 
                         ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" 
                         : "bg-slate-800 text-slate-500 border border-slate-700 opacity-50"
                 )}
             >
                 <ExclamationTriangleIcon className="w-3 h-3" />
                 <span>WARN</span>
                 {levelCounts.warn > 0 && <span className="ml-1 text-[10px] opacity-75">({levelCounts.warn})</span>}
             </button>
             <button 
                 onClick={() => toggleLevel('info')}
                 className={clsx(
                     "flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-all",
                     levelFilters.info 
                         ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                         : "bg-slate-800 text-slate-500 border border-slate-700 opacity-50"
                 )}
             >
                 <InformationCircleIcon className="w-3 h-3" />
                 <span>INFO</span>
                 {levelCounts.info > 0 && <span className="ml-1 text-[10px] opacity-75">({levelCounts.info})</span>}
             </button>
             <button 
                 onClick={() => toggleLevel('debug')}
                 className={clsx(
                     "flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-all",
                     levelFilters.debug 
                         ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" 
                         : "bg-slate-800 text-slate-500 border border-slate-700 opacity-50"
                 )}
             >
                 <BugAntIcon className="w-3 h-3" />
                 <span>DEBUG</span>
                 {levelCounts.debug > 0 && <span className="ml-1 text-[10px] opacity-75">({levelCounts.debug})</span>}
             </button>
         </div>

         {/* Right: Line count & Live indicator */}
         <div className="flex items-center space-x-3">
             <div className="text-xs text-slate-500 font-mono">
                 {visibleLines.toLocaleString()} / {totalLines.toLocaleString()} lines
             </div>
             {/* WebSocket status dot */}
             <span title={wsStatus} className="flex items-center gap-1 text-xs font-mono">
                 <span className={`w-2 h-2 rounded-full ${
                     wsStatus === 'connected' ? 'bg-emerald-400' :
                     wsStatus === 'connecting' ? 'bg-amber-400 animate-pulse' :
                     'bg-rose-500'
                 }`} />
             </span>
             <button
                 onClick={togglePause}
                 className={`flex items-center px-3 py-1.5 text-xs rounded transition-colors font-medium ${
                     !isPlaying
                     ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                     : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                 }`}
             >
                 {!isPlaying ? <PauseIcon className="w-3 h-3 mr-1.5" /> : <PlayIcon className="w-3 h-3 mr-1.5" />}
                 {isPlaying ? "Live" : "Paused"}
             </button>
         </div>
      </div>

      {/* Search/Filter Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border-b border-slate-800/50 gap-3">
         <div className="flex items-center space-x-2 flex-1 max-w-2xl">
            {/* Filter (Grep) */}
            <div className="relative flex-1">
                 <AdjustmentsHorizontalIcon className="w-4 h-4 text-emerald-500 absolute left-3 top-1/2 -translate-y-1/2" />
                 <input 
                    type="text" 
                    placeholder="Filter logs (grep)..." 
                    value={grepTerm}
                    onChange={(e) => { setGrepTerm(e.target.value); grepTermRef.current = e.target.value; reRenderLogs(); }}
                    className="w-full bg-slate-800 border border-slate-700/50 rounded text-xs text-emerald-100 pl-9 pr-2 py-1.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-600"
                 />
            </div>
            
            {/* Search (Find) */}
            <div className="relative flex-1">
                 <MagnifyingGlassIcon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                 <input 
                    type="text" 
                    placeholder="Find in view..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700/50 rounded text-xs text-slate-200 pl-9 pr-2 py-1.5 focus:outline-none focus:border-cyan-500 transition-colors placeholder:text-slate-600"
                 />
            </div>
            <div className="flex space-x-1">
                <button onClick={handleSearchPrev} className="p-1 hover:bg-slate-700 rounded text-slate-400"><ChevronUpIcon className="w-4 h-4" /></button>
                <button onClick={handleSearchNext} className="p-1 hover:bg-slate-700 rounded text-slate-400"><ChevronDownIcon className="w-4 h-4" /></button>
            </div>
         </div>

         {/* Actions */}
         <div className="flex items-center space-x-2">
            
            {/* View Toggle */}
            <div className="flex bg-slate-800 rounded p-0.5">
                <button
                    onClick={() => { viewModeRef.current = 'raw'; setViewMode('raw'); }}
                    className={`p-1 rounded ${viewMode === 'raw' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    title="Terminal View"
                >
                    <CommandLineIcon className="w-4 h-4" />
                </button>
                <button
                    onClick={() => { viewModeRef.current = 'table'; setViewMode('table'); reRenderLogs(); }}
                    className={`p-1 rounded ${viewMode === 'table' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    title="Structured Table View"
                >
                    <TableCellsIcon className="w-4 h-4" />
                </button>
            </div>

            {/* Toggles */}
            <button
                onClick={() => { const next = !showTimestamps; setShowTimestamps(next); showTimestampsRef.current = next; reRenderLogs(); }}
                className={`p-1.5 rounded transition-colors ${showTimestamps ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
                title="Toggle Timestamps"
            >
                <ClockIcon className="w-4 h-4" />
            </button>

             <button
                onClick={() => { const next = !dedup; setDedup(next); dedupRef.current = next; reRenderLogs(); }}
                className={`p-1.5 rounded transition-colors ${dedup ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
                title="Toggle Deduplication (Unique)"
            >
                <Bars3BottomLeftIcon className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-700" />

            {/* Scroll buttons */}
            <button 
                onClick={scrollToTop} 
                className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
                title="Scroll to Top"
            >
                <ChevronDoubleUpIcon className="w-4 h-4" />
            </button>
            <button 
                onClick={scrollToBottom} 
                className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
                title="Scroll to Bottom"
            >
                <ChevronDoubleDownIcon className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-700" />

            <button 
                onClick={handleClear} 
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                title="Clear Logs"
            >
                <TrashIcon className="w-4 h-4" />
            </button>
            <button 
                onClick={handleDownload} 
                className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
                title="Download Logs"
            >
                <ArrowDownTrayIcon className="w-4 h-4" />
            </button>
         </div>
      </div>

      <div className="flex-1 w-full relative min-h-0 bg-[#0f172a] flex flex-col">
          {/* XTerm View */}
          <div className={clsx("absolute inset-0 p-2", viewMode !== 'raw' && 'hidden')}>
              <div ref={terminalRef} className="h-full w-full" />
          </div>
          
          {/* Table View */}
          {viewMode === 'table' && (
               <div className="absolute inset-0 bg-[#0f172a]">
                   <StructuredLogViewer 
                        logs={filteredLogs} 
                        filter={grepTerm} 
                        dedup={dedup}
                        showTimestamp={showTimestamps}
                   />
               </div>
          )}
      </div>
    
    </div>
  );
};
