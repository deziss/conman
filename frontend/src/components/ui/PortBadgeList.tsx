import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { parseContainerPorts, groupPortRanges, type FormattedPort, type PortRangeGroup } from '../../utils/ports';
import { ArrowTopRightOnSquareIcon, ClipboardDocumentIcon, CheckIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';

interface PortBadgeListProps {
  ports: any;
  host?: any;
  maxVisible?: number;
  className?: string;
  isCompact?: boolean;
}

interface ActiveModalState {
  title: string;
  subtitle?: string;
  ports: FormattedPort[];
}

export const PortBadgeList: React.FC<PortBadgeListProps> = ({
  ports,
  host,
  maxVisible = 2,
  className,
  isCompact = false,
}) => {
  const parsedPorts: FormattedPort[] = parseContainerPorts(ports, host);
  const groups: PortRangeGroup[] = groupPortRanges(parsedPorts);

  const [activeModalInfo, setActiveModalInfo] = useState<ActiveModalState | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Close modal on Escape
  useEffect(() => {
    if (!activeModalInfo) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveModalInfo(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModalInfo]);

  if (groups.length === 0) {
    return <span className="text-slate-400 dark:text-slate-500 font-mono text-xs">-</span>;
  }

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const visibleGroups = groups.slice(0, maxVisible);
  const remainingGroups = groups.slice(maxVisible);
  const totalHiddenPorts = remainingGroups.reduce((acc, g) => acc + g.count, 0);

  // Filtered ports inside active modal
  const filteredModalPorts = activeModalInfo
    ? activeModalInfo.ports.filter((p) => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return (
          p.display.toLowerCase().includes(q) ||
          String(p.publicPort || '').includes(q) ||
          String(p.privatePort || '').includes(q) ||
          (p.type || '').toLowerCase().includes(q)
        );
      })
    : [];

  return (
    <div className={clsx('flex flex-wrap items-center gap-1.5', className)}>
      {visibleGroups.map((group) => {
        // Range badge (e.g. 41000-41008 (9))
        if (group.isRange) {
          return (
            <button
              key={group.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSearchTerm('');
                setActiveModalInfo({
                  title: `Port Range: ${group.display}`,
                  subtitle: `${group.count} consecutive ports (${group.type.toUpperCase()})`,
                  ports: group.ports,
                });
              }}
              className={clsx(
                'inline-flex items-center gap-1 rounded font-mono font-medium transition-colors cursor-pointer select-none',
                'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 active:scale-95',
                isCompact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
              )}
              title={`Click to view all ${group.count} ports in range ${group.display}`}
            >
              <span>{group.display}</span>
              <span className="px-1 py-0.2 rounded-full text-[9px] font-bold bg-indigo-200/80 dark:bg-indigo-400/20 text-indigo-800 dark:text-indigo-300">
                {group.count}
              </span>
            </button>
          );
        }

        // Single port - Clean native badge without any intrusive popup
        const port = group.ports[0];
        if (port.url) {
          return (
            <a
              key={group.id}
              href={port.url}
              target="_blank"
              rel="noopener noreferrer"
              className={clsx(
                'inline-flex items-center gap-1 rounded font-mono font-medium transition-colors select-text',
                'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 hover:text-indigo-900 dark:hover:text-indigo-200',
                isCompact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
              )}
              title={`Open ${port.url}`}
              onClick={(e) => e.stopPropagation()}
            >
              <span>{port.display}</span>
              <ArrowTopRightOnSquareIcon className={isCompact ? 'w-2.5 h-2.5 text-indigo-500' : 'w-3 h-3 text-indigo-500'} />
            </a>
          );
        }

        // Unmapped single port (e.g. 5073/tcp)
        return (
          <span
            key={group.id}
            className={clsx(
              'inline-block rounded font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 select-text',
              isCompact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
            )}
          >
            {port.display}
          </span>
        );
      })}

      {/* Overflow Badge (+N more) */}
      {remainingGroups.length > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSearchTerm('');
            setActiveModalInfo({
              title: `All Exposed Ports (${parsedPorts.length} total)`,
              subtitle: `${groups.length} port mappings for this container`,
              ports: parsedPorts,
            });
          }}
          className={clsx(
            'inline-flex items-center gap-1 rounded font-mono font-semibold transition-all cursor-pointer active:scale-95',
            'bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 hover:text-cyan-600 dark:hover:text-cyan-400 hover:border-cyan-300 dark:hover:border-cyan-700',
            isCompact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
          )}
          title={`Click to view all ${parsedPorts.length} ports`}
        >
          <span>+{totalHiddenPorts} more</span>
        </button>
      )}

      {/* Professional Centered Modal: Never blocks table rows or covers adjacent ports */}
      {activeModalInfo && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setActiveModalInfo(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {activeModalInfo.title}
                </h3>
                {activeModalInfo.subtitle && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {activeModalInfo.subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActiveModalInfo(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md text-sm transition-colors"
                title="Close (Esc)"
              >
                ✕
              </button>
            </div>

            {/* Filter and Copy Bar */}
            <div className="px-4 py-2.5 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search port or protocol..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full text-xs pl-8 pr-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={() => handleCopy(activeModalInfo.ports.map((p) => p.display).join(', '), 'all')}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0 shadow-sm"
              >
                {copiedId === 'all' ? <CheckIcon className="w-3.5 h-3.5 text-emerald-500" /> : <ClipboardDocumentIcon className="w-3.5 h-3.5" />}
                <span>{copiedId === 'all' ? 'Copied' : 'Copy All'}</span>
              </button>
            </div>

            {/* Ports List */}
            <div className="p-3 overflow-y-auto flex-1 space-y-1.5 select-text">
              {filteredModalPorts.map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/50 text-xs font-mono select-text hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center gap-2 select-text truncate">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                      {p.type || 'tcp'}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 select-text">
                      {p.display}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.url && (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-sans font-semibold text-indigo-600 dark:text-indigo-400 hover:underline px-2 py-0.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                      >
                        <span>Open</span>
                        <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopy(p.display, `${p.display}-${idx}`)}
                      className="text-[11px] px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700/70 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors font-sans"
                      title="Copy port"
                    >
                      {copiedId === `${p.display}-${idx}` ? '✓' : 'Copy'}
                    </button>
                  </div>
                </div>
              ))}

              {filteredModalPorts.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-400">
                  No ports matching "{searchTerm}"
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
              <span className="text-[11px] font-mono text-slate-500">
                {filteredModalPorts.length} of {activeModalInfo.ports.length} ports
              </span>
              <button
                type="button"
                onClick={() => setActiveModalInfo(null)}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
