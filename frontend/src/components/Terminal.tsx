import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface TerminalProps {
  containerId: string;
  agentId?: string;
}

export const Terminal = ({ containerId, agentId }: TerminalProps) => {
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
      cursorBlink: true,
      cursorStyle: 'bar',
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = localStorage.getItem('token');
    
    let wsUrl = `${protocol}//${window.location.host}/api/v1/docker/containers/${containerId}/exec?token=${token}`;
    if (agentId) {
        wsUrl = `${protocol}//${window.location.host}/api/v1/agents/${agentId}/containers/${containerId}/exec?token=${token}`;
    }
    
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
       fitAddon.fit();
       // Initial resize
       socket.send(JSON.stringify({
           type: 'resize',
           rows: term.rows,
           cols: term.cols
       }));
    };

    socket.onmessage = (event) => {
        // Backend sends raw bytes from stdout/stderr
        if (typeof event.data === 'string') {
           term.write(event.data);
        } else {
           // If blob, we might need to read it. Xterm handles string.
           // Assuming text frame.
           const reader = new FileReader();
           reader.onload = () => {
               term.write(reader.result as string);
           };
           reader.readAsText(event.data);
        }
    };

    socket.onclose = () => {
        term.write('\r\n\x1b[31mConnection closed.\x1b[0m\r\n');
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
