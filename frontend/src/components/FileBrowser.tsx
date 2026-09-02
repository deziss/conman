import React, { useState, useEffect, useRef } from 'react';
import { 
    FolderIcon, 
    DocumentIcon, 
    ArrowUturnLeftIcon, 
    HomeIcon,
    ArrowDownTrayIcon,
    ArrowUpTrayIcon,
    ArrowPathIcon
} from '@heroicons/react/24/solid';
import api from '../services/api';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import { useHost } from '../contexts/HostContext';
import { formatFileSize } from '../utils/format';

interface FileEntry {
    name: string;
    size: number;
    mode: string;
    mod_time: string;
    is_dir: boolean;
}

interface FileBrowserProps {
    containerId: string;
    agentId?: string;
}

export const FileBrowser = ({ containerId, agentId }: FileBrowserProps) => {
    const [createPath, setPath] = useState('/');
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { currentHost } = useHost();
    
    // Allow prop override, otherwise use context
    const targetAgentId = agentId || currentHost?.id;

    const fetchFiles = async (currentPath: string) => {
        setLoading(true);
        try {
            const endpoint = targetAgentId 
                ? `/agents/${targetAgentId}/containers/${containerId}/files`
                : `/containers/${containerId}/files`;

            const { data } = await api.get(endpoint, {
                params: { path: currentPath }
            });
            if (Array.isArray(data)) {
                setFiles(data.filter(f => f && f.name && !f.name.includes('executable file not found') && !f.name.includes('OCI runtime')));
            } else {
                setFiles([]);
            }
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

    const uploadFile = async (file: File) => {
        if (!file) return;
        setUploading(true);
        const toastId = toast.loading(`Uploading ${file.name}...`);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const uploadUrl = targetAgentId
                ? `/agents/${targetAgentId}/containers/${containerId}/files/upload`
                : `/containers/${containerId}/files/upload`;

            await api.post(uploadUrl, formData, {
                params: { path: createPath, filename: file.name },
                headers: {
                    'Content-Type': 'multipart/form-data',
                }
            });

            toast.success(`Successfully uploaded ${file.name}`, { id: toastId });
            await fetchFiles(createPath);
        } catch (error: any) {
            console.error("Failed to upload file", error);
            const msg = error?.response?.data?.error || error?.response?.data?.message || error.message || 'Upload failed';
            toast.error(`Upload error: ${msg}`, { id: toastId });
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            uploadFile(file);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            uploadFile(file);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const getDownloadUrl = (fileName: string) => {
        const filePath = createPath === '/' ? `/${fileName}` : `${createPath}/${fileName}`;
        const base = api.defaults.baseURL || '';
        return targetAgentId
            ? `${base}/agents/${targetAgentId}/containers/${containerId}/files/download?path=${encodeURIComponent(filePath)}`
            : `${base}/containers/${containerId}/files/download?path=${encodeURIComponent(filePath)}`;
    };

    return (
        <div 
            className="h-full flex flex-col bg-white dark:bg-slate-900 relative"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Hidden file input */}
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileInputChange} 
                className="hidden" 
            />

            {/* Breadcrumb / Navigation Bar */}
            <div className="flex items-center space-x-2 p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-white/5">
                <button 
                    onClick={() => setPath('/')}
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                    title="Go Home"
                >
                    <HomeIcon className="w-5 h-5" />
                </button>
                <button 
                    onClick={handleUp}
                    disabled={createPath === '/'}
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Go Up"
                >
                    <ArrowUturnLeftIcon className="w-5 h-5" />
                </button>
                <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900/50 rounded-lg text-sm font-mono text-slate-800 dark:text-slate-300 flex-1 truncate border border-slate-200 dark:border-white/5">
                    {createPath}
                </div>
                <button 
                    onClick={() => fetchFiles(createPath)}
                    disabled={loading}
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors disabled:opacity-50"
                    title="Refresh Directory"
                >
                    <ArrowPathIcon className={clsx("w-5 h-5", loading && "animate-spin")} />
                </button>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                    title="Upload file to container"
                >
                    <ArrowUpTrayIcon className="w-4 h-4" />
                    <span>{uploading ? 'Uploading...' : 'Upload'}</span>
                </button>
            </div>

            {/* Drag & drop overlay indicator */}
            {isDragOver && (
                <div className="absolute inset-0 z-20 bg-indigo-600/20 backdrop-blur-xs border-2 border-dashed border-indigo-500 flex flex-col items-center justify-center pointer-events-none">
                    <ArrowUpTrayIcon className="w-12 h-12 text-indigo-400 mb-2 animate-bounce" />
                    <p className="text-base font-semibold text-slate-900 dark:text-white">Drop file to upload to {createPath}</p>
                </div>
            )}

            {/* File List */}
            <div className="flex-1 overflow-auto p-4">
                {loading ? (
                    <div className="text-center text-slate-500 mt-10">Loading files...</div>
                ) : (
                    <div className="grid grid-cols-1 gap-2">
                         {/* Header */}
                         <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-semibold text-slate-500 border-b border-slate-200 dark:border-white/5 uppercase tracking-wider">
                             <div className="col-span-5">Name</div>
                             <div className="col-span-1 text-right">Size</div>
                             <div className="col-span-2 text-center">Permissions</div>
                             <div className="col-span-2 text-right">Modified</div>
                             <div className="col-span-2 text-right">Actions</div>
                         </div>

                        {files.length === 0 && (
                            <div className="text-center text-slate-500 mt-10 p-10 bg-slate-50 dark:bg-slate-800/30 rounded-lg border border-slate-200 dark:border-white/5 border-dashed">
                                Directory is empty. Drag and drop a file or click Upload to add files.
                            </div>
                        )}

                        {files.map((file, i) => (
                            <div 
                                key={i}
                                onClick={() => handleNavigate(file)}
                                className={clsx(
                                    "grid grid-cols-12 gap-4 px-4 py-3 rounded-lg items-center transition-colors cursor-pointer border border-transparent",
                                    "hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:border-slate-200 dark:hover:border-white/5",
                                    file.is_dir ? "text-slate-900 dark:text-slate-200 font-medium" : "text-slate-700 dark:text-slate-400"
                                )}
                            >
                                <div className="col-span-5 flex items-center space-x-3 overflow-hidden">
                                    {file.is_dir ? (
                                        <FolderIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                                    ) : (
                                        <DocumentIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                    )}
                                    <span className="truncate font-mono text-sm">{file.name}</span>
                                </div>
                                <div className="col-span-1 text-right font-mono text-xs text-slate-500">
                                    {file.is_dir ? '-' : formatFileSize(file.size)}
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
                                                window.location.href = getDownloadUrl(file.name);
                                            }}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/5 rounded-md transition-colors"
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
