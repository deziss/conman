import { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { 
    PlusIcon, 
    PlayIcon, 
    ArrowPathIcon, 
    TrashIcon, 
    DocumentTextIcon, 
    Squares2X2Icon, 
    TableCellsIcon,
    MagnifyingGlassIcon,
    ClipboardDocumentIcon,
    CheckIcon,
    FolderIcon,
    AdjustmentsHorizontalIcon
} from '@heroicons/react/24/solid';
import { useHost } from '../contexts/HostContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useLicense } from '../contexts/LicenseContext';
import { UpgradePrompt } from '../components/ui/UpgradePrompt';
import { useSettings } from '../contexts/SettingsContext';
import { GlassCard } from '../components/ui/GlassCard';
import { StackConfigEditorModal } from '../components/stacks/StackConfigEditorModal';
import clsx from 'clsx';

interface Stack {
    Name: string;
    Status: string;
    Services: number;
    ConfigFiles: string;
}

export const Stacks = () => {
    const { hasFeature } = useLicense();
    if (!hasFeature('stacks')) {
        return <UpgradePrompt feature="Stack Management" requiredTier="pro" />;
    }

    const { currentHost } = useHost();
    const { density } = useSettings();
    const isCompactDensity = density === 'compact';

    const [stacks, setStacks] = useState<Stack[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStackName, setEditingStackName] = useState<string | null>(null);
    
    // View mode: 'grid' | 'table'
    const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
        const saved = localStorage.getItem('conman_stacks_view_mode');
        return (saved === 'table' || saved === 'grid') ? saved : 'grid';
    });

    const handleViewModeChange = (mode: 'grid' | 'table') => {
        setViewMode(mode);
        localStorage.setItem('conman_stacks_view_mode', mode);
    };

    // Filter & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'partial' | 'exited'>('all');
    const [copiedPath, setCopiedPath] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<{ name: string; action: string } | null>(null);

    // Form State for new stack
    const [newName, setNewName] = useState('');
    const [newCompose, setNewCompose] = useState('version: "3.8"\nservices:\n  web:\n    image: nginx:alpine\n    ports:\n      - "8080:80"');
    const [newEnv, setNewEnv] = useState('');

    const fetchStacks = async () => {
        if (!currentHost) return;
        try {
            const { data } = await api.get(`/agents/${currentHost.id}/stacks`);
            setStacks(data || []);
        } catch (error) {
            console.error("Fetch stacks failed", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStacks();
        const interval = setInterval(fetchStacks, 10000);
        return () => clearInterval(interval);
    }, [currentHost]);

    const handleCopyPath = (path: string, e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(path);
        setCopiedPath(path);
        toast.success('Path copied to clipboard');
        setTimeout(() => setCopiedPath(null), 2000);
    };

    const handleCreate = async () => {
        if (!newName) return toast.error('Name is required');
        if (!currentHost) return;
        try {
            await api.post(`/agents/${currentHost.id}/stacks`, {
                name: newName,
                compose_content: newCompose,
                env_content: newEnv
            });
            toast.success('Stack deploying...');
            setIsModalOpen(false);
            setNewName('');
            fetchStacks();
        } catch (error: any) {
            toast.error(`Failed to create stack: ${error.response?.data || error.message}`);
        }
    };

    const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: string }>({ isOpen: false, id: '' });
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = (name: string) => {
        setConfirmDelete({ isOpen: true, id: name });
    };

    const executeDelete = async () => {
        if (!currentHost) return;
        setIsDeleting(true);
        try {
            await api.delete(`/agents/${currentHost.id}/stacks/${encodeURIComponent(confirmDelete.id)}`);
            toast.success('Stack removed');
            await fetchStacks();
        } catch (error: any) {
            toast.error(`Failed to delete stack: ${error.response?.data || error.message}`);
        } finally {
            setIsDeleting(false);
            setConfirmDelete({ isOpen: false, id: '' });
        }
    };

    const handleUp = async (name: string) => {
        if (!currentHost) return;
        setActionLoading({ name, action: 'up' });
        try {
            await api.post(`/agents/${currentHost.id}/stacks/${encodeURIComponent(name)}/up`);
            toast.success(`Starting stack ${name}...`);
            fetchStacks();
        } catch (error: any) {
            toast.error(`Failed to start stack: ${error.response?.data || error.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleRestart = async (name: string) => {
        if (!currentHost) return;
        setActionLoading({ name, action: 'restart' });
        try {
            await api.post(`/agents/${currentHost.id}/stacks/${encodeURIComponent(name)}/restart`);
            toast.success(`Restarting stack ${name}...`);
            fetchStacks();
        } catch (error: any) {
            toast.error(`Failed to restart stack: ${error.response?.data || error.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    // Filter logic
    const filteredStacks = useMemo(() => {
        return stacks.filter(stack => {
            const matchesSearch = !searchQuery || 
                stack.Name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (stack.ConfigFiles && stack.ConfigFiles.toLowerCase().includes(searchQuery.toLowerCase()));
            
            const normalizedStatus = (stack.Status || '').toLowerCase();
            const matchesStatus = statusFilter === 'all' 
                || (statusFilter === 'active' && normalizedStatus === 'active')
                || (statusFilter === 'partial' && normalizedStatus === 'partial')
                || (statusFilter === 'exited' && (normalizedStatus === 'exited' || normalizedStatus === 'stopped'));

            return matchesSearch && matchesStatus;
        });
    }, [stacks, searchQuery, statusFilter]);

    // Status pill renderer
    const renderStatusBadge = (status: string, compact = false) => {
        const s = (status || '').toLowerCase();
        const isAct = s === 'active';
        const isPart = s === 'partial';
        const isExit = s === 'exited' || s === 'stopped';

        return (
            <span className={clsx(
                "inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wider shrink-0",
                compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-0.5 text-[10px]",
                isAct && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30",
                isPart && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30",
                isExit && "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30",
                !isAct && !isPart && !isExit && "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30"
            )}>
                <span className={clsx(
                    "rounded-full shrink-0",
                    compact ? "w-1.5 h-1.5" : "w-2 h-2",
                    isAct && "bg-emerald-500 animate-pulse",
                    isPart && "bg-amber-500",
                    isExit && "bg-slate-400",
                    !isAct && !isPart && !isExit && "bg-cyan-500"
                )} />
                <span>{status}</span>
            </span>
        );
    };

    return (
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                        <DocumentTextIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            Compose Stacks
                            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                                {stacks.length}
                            </span>
                        </h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Multi-container applications and Compose stacks
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    {currentHost && (
                        <span className="inline-flex items-center text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60 font-mono">
                            Host: {currentHost.name}
                        </span>
                    )}
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold px-3.5 py-1.5 rounded-lg transition-colors shadow-md shadow-indigo-500/20"
                    >
                        <PlusIcon className="w-4 h-4" />
                        <span>New Stack</span>
                    </button>
                </div>
            </div>

            {/* Filter Bar & View Toggle */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/40 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 backdrop-blur-md">
                {/* Search & Status Filters */}
                <div className="flex flex-wrap items-center gap-2 flex-1">
                    <div className="relative min-w-[200px] flex-1 max-w-sm">
                        <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Filter stacks or paths..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full text-xs pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>

                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                        {(['all', 'active', 'partial', 'exited'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setStatusFilter(tab)}
                                className={clsx(
                                    "px-2.5 py-1 rounded-md capitalize font-medium transition-all text-xs",
                                    statusFilter === tab
                                        ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center self-end md:self-auto bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <button
                        onClick={() => handleViewModeChange('grid')}
                        className={clsx(
                            "p-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
                            viewMode === 'grid'
                                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        )}
                        title="Compact Grid View"
                    >
                        <Squares2X2Icon className="w-4 h-4" />
                        <span className="hidden sm:inline">Grid</span>
                    </button>
                    <button
                        onClick={() => handleViewModeChange('table')}
                        className={clsx(
                            "p-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
                            viewMode === 'table'
                                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        )}
                        title="List / Table View"
                    >
                        <TableCellsIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">List</span>
                    </button>
                </div>
            </div>

            {/* Content Area */}
            {loading ? (
                <div className="text-center py-20 text-slate-500 flex flex-col items-center justify-center gap-2">
                    <ArrowPathIcon className="w-6 h-6 animate-spin text-indigo-500" />
                    <span className="text-sm">Loading stacks...</span>
                </div>
            ) : filteredStacks.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                    <DocumentTextIcon className="w-10 h-10 mx-auto text-slate-400 mb-2 opacity-60" />
                    <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">
                        {stacks.length === 0 ? 'No Stacks Found' : 'No Matching Stacks'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                        {stacks.length === 0 
                            ? 'Create or deploy a Docker Compose stack to manage multi-container services.' 
                            : 'Try adjusting your search query or status filter.'}
                    </p>
                </div>
            ) : viewMode === 'grid' ? (
                /* Compact Grid View */
                <div className={clsx(
                    "grid gap-3.5",
                    isCompactDensity 
                        ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" 
                        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                )}>
                    {filteredStacks.map(stack => {
                        const isActionRunning = actionLoading?.name === stack.Name;
                        const shortPath = stack.ConfigFiles ? stack.ConfigFiles.split('/').pop() || stack.ConfigFiles : '';

                        return (
                            <div 
                                key={stack.Name} 
                                className={clsx(
                                    "group bg-white dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 hover:border-indigo-500/40 dark:hover:border-indigo-500/40 rounded-xl transition-all shadow-sm hover:shadow-md flex flex-col justify-between",
                                    isCompactDensity ? "p-3.5" : "p-4"
                                )}
                            >
                                <div className="space-y-2.5">
                                    {/* Top Row: Name + Services count + Status */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate" title={stack.Name}>
                                                    {stack.Name}
                                                </h3>
                                                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60 shrink-0">
                                                    {stack.Services} svc
                                                </span>
                                            </div>
                                        </div>
                                        {renderStatusBadge(stack.Status, true)}
                                    </div>

                                    {/* Config Path Snippet */}
                                    {stack.ConfigFiles && (
                                        <div 
                                            onClick={(e) => handleCopyPath(stack.ConfigFiles, e)}
                                            className="flex items-center justify-between gap-1.5 px-2 py-1 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/50 text-[11px] font-mono text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group/path"
                                            title={`Click to copy: ${stack.ConfigFiles}`}
                                        >
                                            <div className="flex items-center gap-1 min-w-0">
                                                <FolderIcon className="w-3.5 h-3.5 text-slate-400 group-hover/path:text-indigo-400 shrink-0" />
                                                <span className="truncate">{shortPath}</span>
                                            </div>
                                            <span className="text-[10px] text-slate-400 shrink-0 font-sans group-hover/path:text-indigo-500 font-medium">
                                                {copiedPath === stack.ConfigFiles ? (
                                                    <span className="text-emerald-500 font-semibold flex items-center gap-0.5">
                                                        <CheckIcon className="w-3 h-3" /> Copied
                                                    </span>
                                                ) : (
                                                    <ClipboardDocumentIcon className="w-3 h-3 opacity-60 group-hover/path:opacity-100" />
                                                )}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Bottom Row: Actions */}
                                <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                                        Compose Stack
                                    </span>
                                    <div className="flex items-center gap-1">
                                        {(stack.Status === 'exited' || stack.Status === 'partial') && (
                                            <button 
                                                onClick={() => handleUp(stack.Name)} 
                                                disabled={isActionRunning}
                                                title="Start (Compose Up)" 
                                                className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-md transition-colors"
                                            >
                                                {isActionRunning && actionLoading?.action === 'up' ? (
                                                    <ArrowPathIcon className="w-4 h-4 animate-spin text-emerald-500" />
                                                ) : (
                                                    <PlayIcon className="w-4 h-4" />
                                                )}
                                            </button>
                                        )}
                                        {stack.Status === 'active' && (
                                            <button 
                                                onClick={() => handleRestart(stack.Name)} 
                                                disabled={isActionRunning}
                                                title="Restart Stack" 
                                                className="p-1.5 text-slate-400 hover:text-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-500/10 rounded-md transition-colors"
                                            >
                                                {isActionRunning && actionLoading?.action === 'restart' ? (
                                                    <ArrowPathIcon className="w-4 h-4 animate-spin text-cyan-500" />
                                                ) : (
                                                    <ArrowPathIcon className="w-4 h-4" />
                                                )}
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => setEditingStackName(stack.Name)} 
                                            title="Live Reconfigure (.env & Compose)" 
                                            className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-md transition-colors"
                                        >
                                            <AdjustmentsHorizontalIcon className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(stack.Name)} 
                                            title="Remove (Compose Down)" 
                                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-md transition-colors"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* List / Table View */
                <GlassCard className="p-0 overflow-hidden border border-slate-200 dark:border-slate-800">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                    <th className={clsx("px-4 py-2.5", isCompactDensity && "py-2")}>Status</th>
                                    <th className={clsx("px-4 py-2.5", isCompactDensity && "py-2")}>Stack Name</th>
                                    <th className={clsx("px-4 py-2.5", isCompactDensity && "py-2")}>Services</th>
                                    <th className={clsx("px-4 py-2.5", isCompactDensity && "py-2")}>Config Path</th>
                                    <th className={clsx("px-4 py-2.5 text-right", isCompactDensity && "py-2")}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                                {filteredStacks.map(stack => {
                                    const isActionRunning = actionLoading?.name === stack.Name;
                                    return (
                                        <tr 
                                            key={stack.Name}
                                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                                        >
                                            {/* Status */}
                                            <td className="px-4 py-2.5 whitespace-nowrap">
                                                {renderStatusBadge(stack.Status, true)}
                                            </td>

                                            {/* Name */}
                                            <td className="px-4 py-2.5 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <DocumentTextIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                                                    <span className="font-semibold text-slate-900 dark:text-white">
                                                        {stack.Name}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Services */}
                                            <td className="px-4 py-2.5 whitespace-nowrap">
                                                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                                    {stack.Services} services
                                                </span>
                                            </td>

                                            {/* Config Path */}
                                            <td className="px-4 py-2.5">
                                                {stack.ConfigFiles ? (
                                                    <button 
                                                        type="button"
                                                        onClick={(e) => handleCopyPath(stack.ConfigFiles, e)}
                                                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 font-mono text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white max-w-md truncate text-left"
                                                        title={`Click to copy: ${stack.ConfigFiles}`}
                                                    >
                                                        <FolderIcon className="w-3 h-3 text-slate-400 shrink-0" />
                                                        <span className="truncate">{stack.ConfigFiles}</span>
                                                        {copiedPath === stack.ConfigFiles ? (
                                                            <CheckIcon className="w-3 h-3 text-emerald-500 shrink-0" />
                                                        ) : (
                                                            <ClipboardDocumentIcon className="w-3 h-3 opacity-40 hover:opacity-100 shrink-0" />
                                                        )}
                                                    </button>
                                                ) : (
                                                    <span className="text-slate-400 font-mono text-[11px]">-</span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-1">
                                                    {(stack.Status === 'exited' || stack.Status === 'partial') && (
                                                        <button 
                                                            onClick={() => handleUp(stack.Name)} 
                                                            disabled={isActionRunning}
                                                            title="Start (Compose Up)" 
                                                            className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-md transition-colors"
                                                        >
                                                            {isActionRunning && actionLoading?.action === 'up' ? (
                                                                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                                                            ) : (
                                                                <PlayIcon className="w-3.5 h-3.5" />
                                                            )}
                                                        </button>
                                                    )}
                                                    {stack.Status === 'active' && (
                                                        <button 
                                                            onClick={() => handleRestart(stack.Name)} 
                                                            disabled={isActionRunning}
                                                            title="Restart Stack" 
                                                            className="p-1.5 text-slate-400 hover:text-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-500/10 rounded-md transition-colors"
                                                        >
                                                            {isActionRunning && actionLoading?.action === 'restart' ? (
                                                                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin text-cyan-500" />
                                                            ) : (
                                                                <ArrowPathIcon className="w-3.5 h-3.5" />
                                                            )}
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => setEditingStackName(stack.Name)} 
                                                        title="Live Reconfigure (.env & Compose)" 
                                                        className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-md transition-colors"
                                                    >
                                                        <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDelete(stack.Name)} 
                                                        title="Remove (Compose Down)" 
                                                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-md transition-colors"
                                                    >
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </GlassCard>
            )}

            {/* Modal for New Stack */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                            <div className="flex items-center gap-2.5">
                                <DocumentTextIcon className="w-5 h-5 text-indigo-500" />
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Deploy New Stack</h2>
                            </div>
                            <button 
                                onClick={() => setIsModalOpen(false)} 
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm p-1 rounded-md"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto flex-1 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                                    Stack Name
                                </label>
                                <input 
                                    type="text" 
                                    value={newName} 
                                    onChange={e => setNewName(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                                    placeholder="my-app"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full min-h-[360px]">
                                <div className="flex flex-col">
                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                                        docker-compose.yml
                                    </label>
                                    <textarea 
                                        value={newCompose} 
                                        onChange={e => setNewCompose(e.target.value)}
                                        className="flex-1 w-full bg-slate-950 text-slate-200 font-mono text-xs rounded-lg p-3.5 outline-none focus:ring-2 focus:ring-indigo-500 resize-none border border-slate-800 leading-relaxed"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                                        .env (Environment Variables)
                                    </label>
                                    <textarea 
                                        value={newEnv} 
                                        onChange={e => setNewEnv(e.target.value)}
                                        className="flex-1 w-full bg-slate-950 text-slate-200 font-mono text-xs rounded-lg p-3.5 outline-none focus:ring-2 focus:ring-indigo-500 resize-none border border-slate-800 leading-relaxed"
                                        placeholder="PORT=8080&#10;NODE_ENV=production"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2.5">
                            <button 
                                onClick={() => setIsModalOpen(false)} 
                                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleCreate} 
                                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-500/20 transition-all"
                            >
                                Deploy Stack
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Delete Modal */}
            <ConfirmModal
                isOpen={confirmDelete.isOpen}
                onClose={() => { if (!isDeleting) setConfirmDelete({ isOpen: false, id: '' }); }}
                onConfirm={executeDelete}
                title="Remove Stack"
                message="This will run compose down, removing all containers and networks for this stack."
                confirmText="Remove Stack"
                isDestructive
                isLoading={isDeleting}
                loadingText="Removing Stack..."
            />

            {/* Live Stack & Environment Studio Modal */}
            {editingStackName && currentHost && (
                <StackConfigEditorModal
                    isOpen={!!editingStackName}
                    hostId={currentHost.id}
                    stackName={editingStackName}
                    onClose={() => setEditingStackName(null)}
                    onReconciled={fetchStacks}
                />
            )}
        </div>
    );
};
