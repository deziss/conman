import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { 
  CommandLineIcon, 
  ArrowPathIcon, 
  TrashIcon, 
  InformationCircleIcon 
} from '@heroicons/react/24/outline';
import clsx from 'clsx';

interface TerminalProps {
  containerId: string;
  agentId?: string;
}

export const Terminal = ({ containerId, agentId }: TerminalProps) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const [selectedShell, setSelectedShell] = useState<string>('auto');
  const [status, setStatus] = useState<'connecting' | 'connected' | 'closed'>('connecting');
  const [isScratchContainer, setIsScratchContainer] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);

  const handleReconnect = useCallback(() => {
    setIsScratchContainer(false);
    setReconnectKey(prev => prev + 1);
  }, []);

  const handleClear = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  }, []);

  useEffect(() => {
    if (!terminalRef.current) return;

    setStatus('connecting');
    setIsScratchContainer(false);

    // Initialize Xterm instance
    const term = new XTerm({
      theme: {
        background: '#0a0f1d', // slate-950/deep space
        foreground: '#e2e8f0', // slate-200
        cursor: '#06b6d4',     // cyan-500
        cursorAccent: '#0a0f1d',
        selectionBackground: 'rgba(6, 182, 212, 0.3)',
        black: '#0f172a',
        red: '#f43f5e',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f8fafc',
      },
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'block',
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = localStorage.getItem('token');
    
    if (!agentId) {
      term.write('\r\n\x1b[31mError: No host selected. Please select a host from the sidebar.\x1b[0m\r\n');
      setStatus('closed');
      return;
    }

    const shellParam = selectedShell !== 'auto' ? `&shell=${encodeURIComponent(selectedShell)}` : '';
    const wsUrl = `${protocol}//${window.location.host}/api/v1/agents/${agentId}/containers/${containerId}/exec?token=${token}${shellParam}`;
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus('connected');
      fitAddon.fit();
      socket.send(JSON.stringify({
        type: 'resize',
        rows: term.rows,
        cols: term.cols
      }));
    };

    socket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        // Detect scratch container error text
        if (
          event.data.includes('No Shell Found in Container') ||
          event.data.includes('stat /bin/sh: no such file or directory') ||
          event.data.includes('executable file not found in $PATH')
        ) {
          setIsScratchContainer(true);
        }
        term.write(event.data);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result as string;
          if (
            text.includes('No Shell Found in Container') ||
            text.includes('stat /bin/sh: no such file or directory') ||
            text.includes('executable file not found in $PATH')
          ) {
            setIsScratchContainer(true);
          }
          term.write(text);
        };
        reader.readAsText(event.data);
      }
    };

    socket.onclose = () => {
      setStatus('closed');
      term.write('\r\n\x1b[90m[Process finished / Connection closed]\x1b[0m\r\n');
    };

    socket.onerror = () => {
      setStatus('closed');
    };

    term.onData(data => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'input',
          data: data
        }));
      }
    });

    term.onResize(size => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'resize',
          rows: size.rows,
          cols: size.cols
        }));
      }
    });

    const handleResize = () => {
      try {
        fitAddon.fit();
      } catch (e) {
        // ignore layout resize during unmount
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      socket.close();
      term.dispose();
    };
  }, [containerId, agentId, selectedShell, reconnectKey]);

  return (
    <div className="flex flex-col h-full w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-950 shadow-2xl">
      {/* Terminal Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-900 border-b border-white/10 text-xs select-none">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5">
            <span className={clsx(
              "w-2.5 h-2.5 rounded-full transition-colors",
              status === 'connected' && "bg-emerald-500 shadow-sm shadow-emerald-500/50",
              status === 'connecting' && "bg-amber-500 animate-pulse",
              status === 'closed' && "bg-rose-500/80"
            )} />
            <span className="font-mono text-slate-300 font-medium capitalize">
              {status === 'connected' ? 'Interactive' : status}
            </span>
          </div>

          {/* Shell Dropdown */}
          <div className="flex items-center space-x-1.5 pl-3 border-l border-white/10">
            <CommandLineIcon className="w-3.5 h-3.5 text-cyan-400" />
            <select
              value={selectedShell}
              onChange={(e) => setSelectedShell(e.target.value)}
              className="bg-slate-950 border border-white/15 rounded-lg px-2 py-1 text-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
            >
              <option value="auto">Auto-Detect (sh/bash)</option>
              <option value="/bin/sh">/bin/sh</option>
              <option value="/bin/bash">/bin/bash</option>
              <option value="/bin/ash">/bin/ash (Alpine)</option>
              <option value="sh">sh ($PATH)</option>
              <option value="bash">bash ($PATH)</option>
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Clear terminal buffer"
          >
            <TrashIcon className="w-3.5 h-3.5 text-slate-400" />
            <span>Clear</span>
          </button>
          <button
            onClick={handleReconnect}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition-colors cursor-pointer"
            title="Reconnect terminal session"
          >
            <ArrowPathIcon className={clsx("w-3.5 h-3.5", status === 'connecting' && "animate-spin")} />
            <span>Reconnect</span>
          </button>
        </div>
      </div>

      {/* Scratch / Distroless Notice Banner */}
      {isScratchContainer && (
        <div className="p-3 bg-amber-500/10 border-b border-amber-500/30 flex items-start gap-3 text-xs text-amber-200">
          <InformationCircleIcon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 font-sans">
            <p className="font-semibold text-amber-300">
              Scratch / Distroless Container Detected
            </p>
            <p className="text-amber-200/80 leading-relaxed">
              This container is built from a minimal scratch or distroless base image (such as Dozzle, Traefik, or a pure Go/Rust binary) that does not include an internal shell binary (<code className="bg-amber-500/20 px-1 py-0.5 rounded text-[11px] font-mono text-amber-100">/bin/sh</code> or <code className="bg-amber-500/20 px-1 py-0.5 rounded text-[11px] font-mono text-amber-100">/bin/bash</code>). Interactive terminal sessions cannot be started for images without an installed shell.
            </p>
          </div>
        </div>
      )}

      {/* Terminal Viewport */}
      <div className="flex-1 w-full p-2 bg-[#0a0f1d] overflow-hidden min-h-[420px]">
        <div ref={terminalRef} className="h-full w-full" />
      </div>
    </div>
  );
};
