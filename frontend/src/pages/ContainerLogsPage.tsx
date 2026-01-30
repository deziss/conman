import { useParams, Link } from 'react-router-dom';
import { ContainerLogs } from '../components/ContainerLogs';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ChevronLeftIcon } from '@heroicons/react/24/solid';

export const ContainerLogsPage = () => {
    const { id } = useParams<{ id: string }>();

    if (!id) return <div>Invalid Container ID</div>;

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)]">
            <div className="flex items-center space-x-4 mb-4">
                 <Link to="/containers" className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                    <ChevronLeftIcon className="w-5 h-5" />
                 </Link>
                 <h2 className="text-xl font-semibold text-slate-100 font-mono">
                    Logs: <span className="text-cyan-400">{id.substring(0, 12)}</span>
                 </h2>
            </div>
            
            <div className="flex-1 min-h-0 bg-slate-900 rounded-lg overflow-hidden relative">
                 <ErrorBoundary name="ContainerLogs">
                    <ContainerLogs containerId={id} />
                 </ErrorBoundary>
            </div>
        </div>
    );
};
