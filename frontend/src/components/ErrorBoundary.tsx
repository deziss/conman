import React, { Component, ErrorInfo, ReactNode } from "react";
import { isChunkLoadError } from "../utils/lazyRetry";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
  countdown: number;
}

export class ErrorBoundary extends Component<Props, State> {
  private timer: any = null;

  public state: State = {
    hasError: false,
    error: null,
    isChunkError: false,
    countdown: 3,
  };

  public static getDerivedStateFromError(error: Error): State {
    const isChunk = isChunkLoadError(error);
    return { 
      hasError: true, 
      error, 
      isChunkError: isChunk,
      countdown: isChunk ? 2 : 0,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);

    if (isChunkLoadError(error)) {
      // Auto-reload to fetch the newest deployment bundle
      this.timer = setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  }

  public componentWillUnmount() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private handleCopyError = () => {
    if (this.state.error) {
      navigator.clipboard.writeText(
        `${this.state.error.name}: ${this.state.error.message}\n\nStack:\n${this.state.error.stack}`
      );
      alert('Error details copied to clipboard');
    }
  };

  public render() {
    if (this.state.hasError) {
      // Automatic version update screen for stale chunk mismatches
      if (this.state.isChunkError) {
        return (
          <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
            <div className="max-w-md w-full glass p-8 rounded-2xl border border-cyan-500/20 shadow-2xl text-center space-y-6 animate-fade-in">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 animate-pulse">
                <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold font-mono tracking-tight text-white">
                  Updating Conman...
                </h2>
                <p className="text-sm text-slate-400">
                  A newer version of the application has been deployed on the server. Refreshing to load latest updates.
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={this.handleReload}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-medium text-sm shadow-lg shadow-cyan-500/25 transition-all duration-200 cursor-pointer"
                >
                  Refresh Now
                </button>
              </div>
            </div>
          </div>
        );
      }

      // Generic elegant error screen for application errors
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full glass p-8 rounded-2xl border border-rose-500/20 shadow-2xl space-y-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold font-mono text-white">Application Error</h2>
                <p className="text-xs text-slate-400">An unexpected error occurred in the UI runtime.</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-rose-300 max-h-40 overflow-y-auto break-all">
              {this.state.error?.message || this.state.error?.toString()}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-sm transition-colors cursor-pointer"
              >
                Reload Page
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm transition-colors cursor-pointer"
              >
                Go to Dashboard
              </button>
              <button
                onClick={this.handleCopyError}
                className="py-2.5 px-3 rounded-xl bg-slate-800/60 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                title="Copy error details"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
