import React from 'react';
import { clsx } from 'clsx';

interface ConmanLogoProps {
  size?: number | 'sm' | 'md' | 'lg';
  className?: string;
  showText?: boolean;
}

export const ConmanLogo: React.FC<ConmanLogoProps> = ({
  size = 'md',
  className,
  showText = false,
}) => {
  const pixelSize = typeof size === 'number' ? size : size === 'sm' ? 24 : size === 'md' ? 32 : 44;

  return (
    <div className={clsx('inline-flex items-center gap-2.5', className)}>
      <svg
        width={pixelSize}
        height={pixelSize}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-200 hover:scale-105"
      >
        <defs>
          <linearGradient id="cml-border" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="50%" stopColor="#0891B2" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
          <linearGradient id="cml-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0F172A" />
            <stop offset="50%" stopColor="#080E1A" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
          <linearGradient id="cml-cube-top" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0284C7" />
          </linearGradient>
          <linearGradient id="cml-cube-left" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0EA5E9" />
            <stop offset="100%" stopColor="#0369A1" />
          </linearGradient>
          <linearGradient id="cml-cube-right" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0284C7" />
            <stop offset="100%" stopColor="#075985" />
          </linearGradient>
        </defs>

        <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#cml-bg)" />
        <rect x="2" y="2" width="60" height="60" rx="16" stroke="url(#cml-border)" strokeWidth="2" strokeOpacity="0.9" />

        <g transform="translate(0, -2)">
          <path d="M 32 14 L 44 20 L 32 26 L 20 20 Z" fill="url(#cml-cube-top)" />
          <path d="M 20 20 L 32 26 L 32 37 L 20 31 Z" fill="url(#cml-cube-left)" stroke="#0284C7" strokeWidth="0.7" />
          <path d="M 32 26 L 44 20 L 44 31 L 32 37 Z" fill="url(#cml-cube-right)" stroke="#0369A1" strokeWidth="0.7" />
        </g>

        <g transform="translate(-10, 11)">
          <path d="M 32 14 L 40 18 L 32 22 L 24 18 Z" fill="url(#cml-cube-top)" fillOpacity="0.9" />
          <path d="M 24 18 L 32 22 L 32 30 L 24 26 Z" fill="url(#cml-cube-left)" />
          <path d="M 32 22 L 40 18 L 40 26 L 32 30 Z" fill="url(#cml-cube-right)" />
        </g>

        <g transform="translate(10, 11)">
          <path d="M 32 14 L 40 18 L 32 22 L 24 18 Z" fill="url(#cml-cube-top)" fillOpacity="0.9" />
          <path d="M 24 18 L 32 22 L 32 30 L 24 26 Z" fill="url(#cml-cube-left)" />
          <path d="M 32 22 L 40 18 L 40 26 L 32 30 Z" fill="url(#cml-cube-right)" />
        </g>

        <path d="M 48 24 C 52 28 54 34 52 41 C 49 48 41 53 32 53 C 22 53 14 46 13 37" 
              stroke="url(#cml-border)" strokeWidth="3" strokeLinecap="round" />

        <circle cx="32" cy="24" r="2.2" fill="#22D3EE" />
        <circle cx="51" cy="40" r="1.8" fill="#10B981" />
      </svg>

      {showText && (
        <span className="font-bold font-mono tracking-tighter text-2xl flex items-center">
          <span className="text-cyan-600 dark:text-cyan-400">CON</span>
          <span className="text-slate-800 dark:text-white">MAN</span>
        </span>
      )}
    </div>
  );
};
