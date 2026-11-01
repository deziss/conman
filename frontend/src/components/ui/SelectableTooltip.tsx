import React, { useState, useRef, useEffect, type ReactNode } from 'react';
import { clsx } from 'clsx';

interface SelectableTooltipProps {
  trigger: ReactNode;
  content: ReactNode;
  title?: string;
  className?: string;
  contentClassName?: string;
  triggerMode?: 'hover' | 'click' | 'both';
  placement?: 'top' | 'bottom' | 'left' | 'right';
  maxWidth?: string;
}

export const SelectableTooltip: React.FC<SelectableTooltipProps> = ({
  trigger,
  content,
  title,
  className,
  contentClassName,
  triggerMode = 'both',
  placement = 'bottom',
  maxWidth = 'max-w-md',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    if (triggerMode === 'hover' || triggerMode === 'both') {
      clearCloseTimeout();
      setIsOpen(true);
    }
  };

  const handleMouseLeave = () => {
    if (triggerMode === 'hover' || triggerMode === 'both') {
      clearCloseTimeout();
      // Generous delay so users can smoothly move mouse into the tooltip to select text
      closeTimeoutRef.current = setTimeout(() => {
        setIsOpen(false);
      }, 300);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (triggerMode === 'click' || triggerMode === 'both') {
      clearCloseTimeout();
      setIsOpen((prev) => !prev);
    }
  };

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      clearCloseTimeout();
    };
  }, []);

  return (
    <div
      ref={triggerRef}
      className={clsx('relative inline-flex items-center', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {trigger}

      {isOpen && (
        <div
          ref={tooltipRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => e.stopPropagation()}
          className={clsx(
            'absolute z-50 p-3 rounded-xl shadow-2xl border backdrop-blur-xl transition-all duration-150',
            'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-700/80',
            'text-slate-800 dark:text-slate-200 select-text cursor-auto',
            maxWidth,
            placement === 'bottom' && 'top-full left-0 mt-2',
            placement === 'top' && 'bottom-full left-0 mb-2',
            placement === 'right' && 'left-full top-0 ml-2',
            placement === 'left' && 'right-full top-0 mr-2',
            contentClassName
          )}
          style={{ minWidth: '220px' }}
        >
          {title && (
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white">
              <span>{title}</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs px-1 rounded"
                title="Close"
              >
                ✕
              </button>
            </div>
          )}
          <div className="select-text">{content}</div>
        </div>
      )}
    </div>
  );
};
