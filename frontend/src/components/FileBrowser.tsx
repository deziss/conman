
import { useState, useEffect } from 'react';
import { 
    FolderIcon, 
    DocumentIcon, 
    ArrowUturnLeftIcon, 
    HomeIcon,
    ArrowDownTrayIcon
} from '@heroicons/react/24/solid';
import api from '../services/api';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import { useHost } from '../contexts/HostContext';

interface FileEntry {
    name: string;
    size: number;
    mode: string;
    mod_time: string;
    is_dir: boolean;
}

interface FileBrowserProps {
    containerId: string;
    // agentId removed/optional as we use context, but kept for compatibility if needed
    agentId?: string;
}

export const FileBrowser = ({ containerId, agentId }: FileBrowserProps) => {
    const [createPath, setPath] = useState('/');
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const { currentHost } = useHost();
    
    // Allow prop override, otherwise use context
    const targetAgentId = agentId || currentHost?.id;

    const fetchFiles = async (currentPath: string) => {
        if (!targetAgentId) return;
        setLoading(true);
        try {
            const endpoint = `/agents/${targetAgentId}/containers/${containerId}/files`;

            const { data } = await api.get(endpoint, {
                params: { path: currentPath }
            });
            setFiles(data);
        } catch (error) {
            console.error("Failed to list files", error);
            toast.error("Failed to list files");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFiles(createPath);
    }, [containerId, createPath, targetAgentId]);

    const handleNavigate = (entry: FileEntry) => {
        if (entry.is_dir) {
            const newPath = createPath === '/' 
                ? `/${entry.name}` 
                : `${createPath}/${entry.name}`;
            setPath(newPath);
        } else {
            toast('File preview not implemented yet', { icon: 'ℹ️' });
        }
    };

    const handleUp = () => {
        if (createPath === '/') return;
        const parentPath = createPath.substring(0, createPath.lastIndexOf('/')) || '/';
        setPath(parentPath);
    };

    return (
        <div className="h-full flex flex-col">
            {/* Breadcrumb / Navigation Bar */}
            <div className="flex items-center space-x-2 p-4 bg-slate-800/50 border-b border-white/5">
                <button 
                    onClick={() => setPath('/')}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                    title="Go Home"
                >
                    <HomeIcon className="w-5 h-5" />
                </button>
                <button 
                    onClick={handleUp}
                    disabled={createPath === '/'}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Go Up"
                >
                    <ArrowUturnLeftIcon className="w-5 h-5" />
                </button>
                <div className="px-3 py-1.5 bg-slate-900/50 rounded-lg text-sm font-mono text-slate-300 flex-1 truncate border border-white/5">
                    {createPath}
                </div>
            </div>

            {/* File List */}
            <div className="flex-1 overflow-auto p-4">
                {loading ? (
                    <div className="text-center text-slate-500 mt-10">Loading files...</div>
                ) : (
                    <div className="grid grid-cols-1 gap-2">
                         {/* Header */}
                         <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-slate-500 border-b border-white/5 uppercase tracking-wider">
                             <div className="col-span-5">Name</div>
                             <div className="col-span-1 text-right">Size</div>
                             <div className="col-span-2 text-center">Permissions</div>
                             <div className="col-span-2 text-right">Modified</div>
                             <div className="col-span-2 text-right">Actions</div>
                         </div>

                        {files.length === 0 && (
                            <div className="text-center text-slate-500 mt-10 p-10 bg-slate-800/30 rounded-lg border border-white/5 border-dashed">
                                Directory is empty
                            </div>
                        )}

                        {files.map((file, i) => (
                            <div 
                                key={i}
                                onClick={() => handleNavigate(file)}
                                className={clsx(
                                    "grid grid-cols-12 gap-4 px-4 py-3 rounded-lg items-center transition-colors cursor-pointer border border-transparent",
                                    "hover:bg-slate-800/50 hover:border-white/5",
                                    file.is_dir ? "text-slate-200" : "text-slate-400"
                                )}
                            >
                                <div className="col-span-5 flex items-center space-x-3 overflow-hidden">
                                    {file.is_dir ? (
                                        <FolderIcon className="w-5 h-5 text-amber-400 flex-shrink-0" />
                                    ) : (
                                        <DocumentIcon className="w-5 h-5 text-slate-500 flex-shrink-0" />
                                    )}
                                    <span className="truncate font-mono text-sm">{file.name}</span>
                                </div>
                                <div className="col-span-1 text-right font-mono text-xs text-slate-500">
                                    {file.is_dir ? '-' : (file.size > 0 ? file.size : '0')}
                                </div>
                                <div className="col-span-2 text-center font-mono text-xs text-slate-500 truncate">
                                    {file.mode}
                                </div>
                                <div className="col-span-2 text-right text-xs text-slate-500 truncate">
                                    {file.mod_time || '-'}
                                </div>
                                <div className="col-span-2 flex justify-end">
                                    {!file.is_dir && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const path = createPath === '/' ? `/${file.name}` : `${createPath}/${file.name}`;
                                                const url = `${api.defaults.baseURL}/agents/${targetAgentId}/containers/${containerId}/files/download?path=${encodeURIComponent(path)}`;
                                                window.location.href = url;
                                            }}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-400 hover:text-indigo-400 bg-slate-800/50 hover:bg-white/10 border border-white/5 rounded-md transition-colors"
                                            title="Download"
                                        >
                                            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                                            <span>Download</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
