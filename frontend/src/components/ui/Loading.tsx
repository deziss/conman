import { ServerStackIcon } from '@heroicons/react/24/outline';

export const Loading = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-slate-700/30 border-t-cyan-500 animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
            <ServerStackIcon className="w-6 h-6 text-cyan-500/50" />
        </div>
      </div>
      <p className="text-slate-400 text-sm font-medium animate-pulse">Loading Conman...</p>
    </div>
  );
};
