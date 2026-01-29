import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface ContainerLogsProps {
  containerId: string;
}

export const ContainerLogs = ({ containerId }: ContainerLogsProps) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      theme: {
        background: '#0f172a', // slate-900
        foreground: '#e2e8f0', // slate-200
        cursor: '#22d3ee', // cyan-400
        selectionBackground: 'rgba(34, 211, 238, 0.3)',
      },
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 14,
      cursorBlink: false, // No blink for logs
      cursorStyle: 'bar',
      disableStdin: true, // Read-only
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = localStorage.getItem('token');
    const wsUrl = `${protocol}//${window.location.host}/api/v1/containers/${containerId}/logs?token=${token}`;
    
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
       fitAddon.fit();
       term.write('\x1b[32m--- Connected to Container Logs ---\x1b[0m\r\n');
    };

    socket.onmessage = (event) => {
        // Backend sends log stream
        if (typeof event.data === 'string') {
           term.write(event.data);
        } else {
           const reader = new FileReader();
           reader.onload = () => {
               term.write(reader.result as string);
           };
           reader.readAsText(event.data);
        }
    };

    socket.onclose = () => {
        term.write('\r\n\x1b[31m--- Log Stream Closed ---\x1b[0m\r\n');
    };

    xtermRef.current = term;

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      socket.close();
      term.dispose();
      window.removeEventListener('resize', handleResize);
    };
  }, [containerId]);

  return (
    <div className="h-full w-full rounded-lg overflow-hidden bg-slate-900 border border-white/10 shadow-inner">
      <div ref={terminalRef} className="h-full w-full" />
    </div>
  );
};
