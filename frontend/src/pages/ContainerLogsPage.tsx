import { useParams, Link } from 'react-router-dom';
import { ContainerLogs } from '../components/ContainerLogs';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ChevronLeftIcon } from '@heroicons/react/24/solid';
import { useHost } from '../contexts/HostContext';

export const ContainerLogsPage = () => {
    const { id } = useParams<{ id: string }>();
    const { currentHost } = useHost();

    if (!id) return <div>Invalid Container ID</div>;

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)]">
            <div className="flex items-center space-x-4 mb-4">
                 <Link to="/containers" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    <ChevronLeftIcon className="w-5 h-5" />
                 </Link>
                 <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono">
                    Logs: <span className="text-cyan-600 dark:text-cyan-400">{id.substring(0, 12)}</span>
                 </h2>
                 {currentHost && (
                     <span className="text-xs px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono border border-slate-200 dark:border-slate-700">
                         Host: {currentHost.name}
                     </span>
                 )}
            </div>
            
            <div className="flex-1 min-h-0 bg-slate-900 rounded-xl overflow-hidden relative border border-slate-200 dark:border-slate-800 shadow-sm">
                 <ErrorBoundary name="ContainerLogs">
                    <ContainerLogs containerId={id} agentId={currentHost?.id} />
                 </ErrorBoundary>
            </div>
        </div>
    );
};
