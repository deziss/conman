import { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { 
    CpuChipIcon, 
    Square3Stack3DIcon, 
    ServerIcon, 
    ArrowPathIcon,
    BoltIcon
} from '@heroicons/react/24/solid';
import api from '../services/api';
import { useSidebar } from '../layouts/DashboardLayout';

interface SystemInfo {
  containers: number;
  images: number;
  docker_version: string;
  memory_total: number;
  cpu_count: number;
}

export const Dashboard = () => {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const { isCollapsed } = useSidebar();

  const fetchSystemInfo = async () => {
    try {
      const { data } = await api.get('/docker/system/info');
      setInfo(data);
    } catch (error) {
      console.error("Failed to fetch system info", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemInfo();
    const interval = setInterval(fetchSystemInfo, 10000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-500 dark:from-slate-100 dark:to-slate-400">
          System Overview
        </h2>
        <div className="flex items-center space-x-2">
            <GlassCard className="px-4 py-2 flex items-center space-x-2 text-sm text-emerald-600 dark:text-emerald-400 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" role="button" onClick={fetchSystemInfo}>
                <ArrowPathIcon className="w-4 h-4" />
                <span>Refresh</span>
            </GlassCard>
        </div>
      </div>

      {loading ? (
         <div className="text-slate-500 text-center py-20 animate-pulse">Loading system metrics...</div>
      ) : info ? (
        <div className={`grid gap-6 ${
          isCollapsed 
            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' 
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4'
        }`}>
            
            {/* CPU / Cores */}
            <GlassCard className="p-6 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <CpuChipIcon className="w-20 h-20 text-slate-900 dark:text-white" />
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">CPU Cores</p>
                <p className="text-4xl font-mono font-bold mt-2 text-slate-900 dark:text-slate-100">{info.cpu_count}</p>
                 <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500/0 via-blue-500/50 to-blue-500/0 opacity-50" />
            </GlassCard>

             {/* Memory */}
             <GlassCard className="p-6 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <OptionIcon className="w-20 h-20 text-slate-900 dark:text-white" />
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Total Memory</p>
                <p className="text-4xl font-mono font-bold mt-2 text-slate-900 dark:text-slate-100">{formatBytes(info.memory_total)}</p>
                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500/0 via-purple-500/50 to-purple-500/0 opacity-50" />
            </GlassCard>

             {/* Containers Count */}
             <GlassCard className="p-6 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <ServerIcon className="w-20 h-20 text-emerald-900 dark:text-white" />
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Total Containers</p>
                <p className="text-4xl font-mono font-bold mt-2 text-emerald-600 dark:text-emerald-400">{info.containers}</p>
                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0 opacity-50" />
            </GlassCard>

            {/* Images Count */}
            <GlassCard className="p-6 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Square3Stack3DIcon className="w-20 h-20 text-cyan-900 dark:text-white" />
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Total Images</p>
                <p className="text-4xl font-mono font-bold mt-2 text-cyan-600 dark:text-cyan-400">{info.images}</p>
                 <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500/0 via-cyan-500/50 to-cyan-500/0 opacity-50" />
            </GlassCard>

             {/* Docker Version - Full Width or Extra Card */}
             <GlassCard className={`p-6 relative overflow-hidden flex items-center justify-between ${
                 isCollapsed
                    ? 'md:col-span-2 lg:col-span-4'
                    : 'md:col-span-2 lg:col-span-2 xl:col-span-4'
             }`}>
                <div>
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider flex items-center gap-2">
                        <BoltIcon className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                        Docker Engine Version
                    </p>
                    <p className="text-2xl font-mono font-bold mt-1 text-slate-900 dark:text-slate-100">{info.docker_version}</p>
                </div>
                 <div className="text-xs text-slate-600 dark:text-slate-500 font-mono bg-slate-200/50 dark:bg-slate-800/50 px-3 py-1 rounded-full">
                    API Connected
                 </div>
            </GlassCard>
        </div>
      ) : (
          <div className="text-rose-500 text-center">Failed to load system info.</div>
      )}
    </div>
  );
};

// Helper for Memory Icon (reusing existing import or creating a simple SVG wrapper if needed, strictly speaking OptionIcon is not standard heroicon name, checking imports)
// Wait, I imported CpuChipIcon, Square3Stack3DIcon, ServerIcon, ArrowPathIcon.
// Let me correct the icon usage. I'll use `ServerIcon` for Memory maybe? Or `CpuChipIcon`?
// Actually, let's use `CpuChipIcon` for CPU and `ServerIcon` for Containers.
// For Memory, I might not have a great icon in standard set. Let's reuse `ServerIcon` or import `CircleStackIcon` if available.
// I will use `CpuChipIcon` for CPU, `ServerIcon` for Memory (RAM chips look like servers?), `Square3Stack3DIcon` for Images.
// `CubeIcon` for Containers (which is standard for containers).

function OptionIcon(props: any) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={props.className}>
            <path fillRule="evenodd" d="M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm14.25 6a.75.75 0 01-.22.53l-2.25 2.25a.75.75 0 11-1.06-1.06L15.44 12l-1.72-1.72a.75.75 0 111.06-1.06l2.25 2.25c.141.14.22.331.22.53zm-10.28 0a.75.75 0 01.22-.53l2.25-2.25a.75.75 0 111.06 1.06L6.56 12l1.72 1.72a.75.75 0 11-1.06 1.06l-2.25-2.25a.75.75 0 01-.22-.53z" clipRule="evenodd" />
        </svg>
    )
}