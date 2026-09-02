import { isConmanSystemImage } from '../utils/systemProtection';
import { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { 
  ArrowDownTrayIcon, 
  TrashIcon, 
  EyeIcon, 
  ServerStackIcon, 
  ArrowPathIcon,
  CheckCircleIcon,
  ArrowUpCircleIcon,
  ExclamationCircleIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  TableCellsIcon,
  Squares2X2Icon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { InspectModal } from '../components/InspectModal';
import { useSidebar } from '../layouts/DashboardLayout';
import { useHost } from '../contexts/HostContext';
import { useTask } from '../contexts/TaskContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { LoadingState } from '../components/ui/LoadingState';
import { SituationalBanner } from '../components/ui/SituationalBanner';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Pagination } from '../components/ui/Pagination';

interface Image {
  id: string;
  repo_tags: string[];
  size: number;
  created: number;
  status: 'used' | 'unused';
  update_available: boolean;
}

interface UpdateCheckStatus {
  checking: boolean;
  available?: boolean;
  availableTag?: string;
  error?: string;
  checkedAt?: Date;
}

export const Images = () => {
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [pullImageName, setPullImageName] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [sortOrder, setSortOrder] = useState<'created' | 'name' | 'size' | 'status'>('created');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() => {
    return (localStorage.getItem('conman_images_view') as 'table' | 'grid') || 'table';
  });
  const [inspectData, setInspectData] = useState<any>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [updateStatuses, setUpdateStatuses] = useState<Record<string, UpdateCheckStatus>>({});
  const [checkingAll, setCheckingAll] = useState(false);
  const { isCollapsed } = useSidebar();
  const { currentHost } = useHost();
  const { startTask } = useTask();

  const handleViewModeChange = (mode: 'table' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('conman_images_view', mode);
  };

  const fetchImages = async () => {
    try {
      if (!currentHost) return;
      const { data } = await api.get('/agents/' + currentHost.id + '/images');
      setImages(data || []);
    } catch (error) {
      console.error("Failed to fetch images", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, [currentHost]);

  const checkImageUpdate = async (imageId: string) => {
    if (!currentHost) return;
    
    setUpdateStatuses(prev => ({
      ...prev,
      [imageId]: { checking: true }
    }));

    try {
      const { data } = await api.get(`/agents/${currentHost.id}/images/${encodeURIComponent(imageId)}/check-update`);
      setUpdateStatuses(prev => ({
        ...prev,
        [imageId]: {
          checking: false,
          available: data.update_available,
          availableTag: data.available_tag,
          checkedAt: new Date()
        }
      }));
    } catch (error: any) {
      setUpdateStatuses(prev => ({
        ...prev,
        [imageId]: {
          checking: false,
          error: error.response?.data?.error || 'Failed to check update',
          checkedAt: new Date()
        }
      }));
    }
  };

  const checkAllUpdates = async () => {
    if (!currentHost || checkingAll) return;
    setCheckingAll(true);
    const toastId = toast.loading(`Checking updates for ${images.length} images...`);

    let updatedCount = 0;
    for (const img of images) {
      try {
        const { data } = await api.get(`/agents/${currentHost.id}/images/${encodeURIComponent(img.id)}/check-update`);
        if (data.update_available) updatedCount++;
        setUpdateStatuses(prev => ({
          ...prev,
          [img.id]: {
            checking: false,
            available: data.update_available,
            availableTag: data.available_tag,
            checkedAt: new Date()
          }
        }));
      } catch (e) {
        // Continue with others
      }
    }

    setCheckingAll(false);
    if (updatedCount > 0) {
      toast.success(`Found ${updatedCount} image update${updatedCount > 1 ? 's' : ''}!`, { id: toastId });
    } else {
      toast.success('All images are up to date', { id: toastId });
    }
  };

  const handleUpdateImage = async (img: Image) => {
    if (!currentHost) return;
    const tag = img.repo_tags && img.repo_tags.length > 0 ? img.repo_tags[0] : null;
    if (!tag) {
      toast.error('Cannot update image without repository tag');
      return;
    }

    const toastId = toast.loading(`Pulling latest ${tag}...`);
    try {
      await api.post(`/agents/${currentHost.id}/images/pull`, { image: tag });
      toast.success(`Successfully updated ${tag}`, { id: toastId });
      setUpdateStatuses(prev => ({
        ...prev,
        [img.id]: { checking: false, available: false, checkedAt: new Date() }
      }));
      fetchImages();
    } catch (err: any) {
      toast.error(`Failed to pull ${tag}: ${err.response?.data?.error || err.message}`, { id: toastId });
    }
  };

  const handlePullImage = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetImage = pullImageName.trim();
    if (!targetImage) return;

    setPulling(true);
    const task = startTask({
      type: 'pull',
      title: 'Pulling Docker Image',
      resource: targetImage,
      initialLog: `Initiating pull for ${targetImage} on host ${currentHost?.name || 'local'}...`
    });

    try {
        if (!currentHost) throw new Error('No agent host selected');
        task.appendLog('Contacting Docker daemon and verifying remote repository manifest...');
        task.setProgress(25);
        
        await api.post(`/agents/${currentHost.id}/images/pull`, { image: targetImage });
        
        task.appendLog('Unpacking layer tarballs and verifying SHA256 checksums...');
        task.setProgress(90);
        task.complete(`Successfully pulled image ${targetImage}`);
        toast.success(`Successfully pulled ${targetImage}`);
        setPullImageName('');
        fetchImages();
    } catch (error: any) {
        const msg = error.response?.data?.error || error.message || 'Failed to pull image';
        task.fail(msg);
        toast.error(`Failed to pull ${targetImage}: ${msg}`);
    } finally {
        setPulling(false);
    }
  };

  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: string }>({ isOpen: false, id: '' });
  const [confirmPrune, setConfirmPrune] = useState(false);
  const [deletingImageIds, setDeletingImageIds] = useState<Record<string, boolean>>({});
  const [isPruning, setIsPruning] = useState(false);

  const handleRemoveImage = (id: string) => {
      const targetImg = images.find(img => img.id === id);
      if (targetImg && isConmanSystemImage(targetImg.repo_tags, targetImg.id)) {
          toast.error('Cannot remove Conman core system image from within the panel.');
          return;
      }
      setConfirmDelete({ isOpen: true, id });
  };

  const handlePruneImages = async () => {
      if (!currentHost) return;
      setIsPruning(true);
      const task = startTask({
          type: 'prune',
          title: 'Pruning Unused Images',
          resource: 'Dangling layers & untagged images',
          initialLog: `Requesting Docker daemon to prune unreferenced image layers...`
      });

      try {
          task.setProgress(30);
          const { data } = await api.post(`/agents/${currentHost.id}/images/prune`);
          const space = data?.space_reclaimed || 0;
          const mbReclaimed = (space / 1024 / 1024).toFixed(1);
          task.appendLog(`Docker engine deleted unreferenced layers. Space reclaimed: ${mbReclaimed} MB`);
          task.complete(`Pruned unused images (${mbReclaimed} MB reclaimed)`);
          toast.success(`Pruned unused images, reclaimed ${mbReclaimed} MB`);
          setConfirmPrune(false);
          fetchImages();
      } catch (err: any) { 
          const msg = err.response?.data?.error || err.message || 'Failed to prune images';
          task.fail(msg);
          toast.error(`Failed to prune images: ${msg}`); 
      } finally {
          setIsPruning(false);
      }
  };

  const executeRemoveImage = async () => {
      const id = confirmDelete.id;
      if (!currentHost || !id) return;
      
      setDeletingImageIds(prev => ({ ...prev, [id]: true }));
      setConfirmDelete({ isOpen: false, id: '' });

      const targetImg = images.find(img => img.id === id);
      const displayName = targetImg?.repo_tags?.[0] || id.substring(0, 12);
      const task = startTask({
          type: 'remove',
          title: 'Removing Docker Image',
          resource: displayName,
          initialLog: `Requesting Docker daemon to untag and delete image ${displayName}...`
      });

      try {
          task.setProgress(40);
          await api.delete(`/agents/${currentHost.id}/images/${encodeURIComponent(id)}`);
          task.appendLog(`Image ${displayName} successfully removed from host storage.`);
          task.complete(`Removed ${displayName}`);
          toast.success(`Removed ${displayName}`);
          setImages(prev => prev.filter(img => img.id !== id));
      } catch (error: any) {
          const errMsg = error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to remove image';
          task.fail(errMsg);
          toast.error(`Error: ${errMsg}`);
      } finally {
          setDeletingImageIds(prev => {
              const next = { ...prev };
              delete next[id];
              return next;
          });
          fetchImages();
      }
  };

  const handleInspect = async (id: string) => {
    try {
        if (!currentHost) return;
        const endpoint = `/agents/${currentHost.id}/images/${encodeURIComponent(id)}`;
        const { data } = await api.get(endpoint);
        setInspectData(data);
        setInspectModalOpen(true);
    } catch (error) {
        toast.error("Failed to inspect image");
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (timestamp: number) => {
      if (!timestamp) return 'Unknown';
      const date = new Date(timestamp * 1000);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));
      
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
      return `${Math.floor(diffDays / 30)} months ago`;
  };

  const getUpdateStatusBadge = (imageId: string) => {
    const status = updateStatuses[imageId];
    if (!status) return null;

    if (status.checking) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">
          <ArrowPathIcon className="w-2.5 h-2.5 mr-1 animate-spin" />
          Checking...
        </span>
      );
    }
    
    if (status.error) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20" title={status.error}>
          <ExclamationCircleIcon className="w-2.5 h-2.5 mr-1" />
          Error
        </span>
      );
    }
    
    if (status.available === true) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse" title="A newer version is available">
          <ArrowUpCircleIcon className="w-2.5 h-2.5 mr-1" />
          {status.availableTag ? status.availableTag : 'Update Available'}
        </span>
      );
    }
    
    if (status.available === false) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-slate-500/20 text-slate-400 border border-slate-500/30">
          <CheckCircleIcon className="w-2.5 h-2.5 mr-1" />
          Up to date
        </span>
      );
    }
    
    return null;
  };

  const filteredImages = statusFilter === 'all'
      ? images
      : images.filter(img => img.status === statusFilter);

  const sortedImages = [...filteredImages].sort((a, b) => {
      if (sortOrder === 'name') {
          const nameA = a.repo_tags && a.repo_tags.length > 0 ? a.repo_tags[0] : a.id;
          const nameB = b.repo_tags && b.repo_tags.length > 0 ? b.repo_tags[0] : b.id;
          return nameA.localeCompare(nameB);
      }
      if (sortOrder === 'size') return b.size - a.size;
      if (sortOrder === 'created') return b.created - a.created;
      if (sortOrder === 'status') {
          if (a.status === 'used' && b.status !== 'used') return -1;
          if (a.status !== 'used' && b.status === 'used') return 1;
          return 0;
      }
      return 0;
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const paginatedImages = sortedImages.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [sortOrder, statusFilter]);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <span>Images</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
              {images.length}
            </span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">Docker image inventory and update management</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {currentHost && (
            <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-medium">
              <ServerStackIcon className="w-4 h-4 text-indigo-500" />
              {currentHost.name}
            </span>
          )}

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
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
            <button
              onClick={() => handleViewModeChange('grid')}
              className={clsx(
                "p-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
                viewMode === 'grid'
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              )}
              title="Cards / Grid View"
            >
              <Squares2X2Icon className="w-4 h-4" />
              <span className="hidden sm:inline">Grid</span>
            </button>
          </div>

          <button
            onClick={checkAllUpdates}
            disabled={checkingAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50"
            title="Check all images for newer tags"
          >
            <ArrowPathIcon className={clsx("w-3.5 h-3.5", checkingAll && "animate-spin text-indigo-500")} />
            <span>Check Updates</span>
          </button>

          <button
            onClick={() => setConfirmPrune(true)}
            disabled={isPruning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 transition-colors disabled:opacity-50"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            <span>Prune Unused</span>
          </button>
        </div>
      </div>

       {/* Pull Image Card */}
       <GlassCard className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                <ArrowDownTrayIcon className="w-4 h-4 text-indigo-500" />
                <span>Pull New Image</span>
            </h3>
            <form onSubmit={handlePullImage} className="flex gap-2">
                <input
                    type="text"
                    value={pullImageName}
                    onChange={(e) => setPullImageName(e.target.value)}
                    placeholder="e.g. nginx:alpine, redis:latest, postgres:16"
                    className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 placeholder-slate-400 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                />
                <button
                    type="submit"
                    disabled={pulling || !pullImageName}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg text-xs font-medium transition-all shadow-md shadow-indigo-500/20 whitespace-nowrap flex items-center gap-1.5"
                >
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                    <span>{pulling ? 'Pulling...' : 'Pull Image'}</span>
                </button>
            </form>
        </GlassCard>

        {/* Toolbar */}
      <GlassCard className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          Showing {filteredImages.length} of {images.length} images
        </span>
        
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            <option value="all">All Statuses ({images.length})</option>
            <option value="used">Used ({images.filter(i => i.status === 'used').length})</option>
            <option value="unused">Unused ({images.filter(i => i.status === 'unused').length})</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            <option value="created">Sort by Created</option>
            <option value="name">Sort by Name</option>
            <option value="size">Sort by Size</option>
            <option value="status">Sort by Status</option>
          </select>
        </div>
      </GlassCard>

      {/* Loading Skeleton */}
      {loading && (
        <LoadingState type="images" viewMode={viewMode} count={viewMode === 'grid' ? 8 : 6} />
      )}

      {/* --- TABLE / LIST VIEW --- */}
      {!loading && viewMode === 'table' && (
        <GlassCard className="p-0 overflow-hidden shadow-xl border border-slate-200 dark:border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-100/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-white/10 uppercase font-semibold tracking-wider text-[11px] sticky top-0 backdrop-blur-sm z-10">
                <tr>
                  <th className="px-4 py-3 min-w-[220px]">Repository & Tag</th>
                  <th className="px-4 py-3 min-w-[130px]">Image ID</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 min-w-[140px]">Update Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5 font-sans">
                {paginatedImages.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      No images matching filters found.
                    </td>
                  </tr>
                ) : (
                  paginatedImages.map((img) => {
                    const isDeleting = !!deletingImageIds[img.id];
                    const isSystem = isConmanSystemImage(img.repo_tags, img.id);
                    const repo = img.repo_tags && img.repo_tags.length > 0 ? img.repo_tags[0].split(':')[0] : '<none>';
                    const tag = img.repo_tags && img.repo_tags.length > 0 ? img.repo_tags[0].split(':')[1] || 'latest' : '<none>';

                    return (
                      <tr
                        key={img.id}
                        className={clsx(
                          "transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03] group",
                          isDeleting && "opacity-50 bg-rose-500/5",
                          isSystem && "bg-cyan-500/[0.02]"
                        )}
                      >
                        {/* Repository & Tag */}
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <Link
                              to={`/images/${encodeURIComponent(img.id)}`}
                              className="font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate max-w-[200px]"
                              title={img.repo_tags?.[0]}
                            >
                              {repo}
                            </Link>
                            <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                              {tag}
                            </span>
                            {isSystem && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20" title="Protected System Image">
                                <ShieldCheckIcon className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                                System
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Image ID */}
                        <td className="px-4 py-3 align-middle font-mono text-xs text-slate-500 whitespace-nowrap">
                          {img.id.substring(7, 19)}
                        </td>

                        {/* Size */}
                        <td className="px-4 py-3 align-middle font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {formatSize(img.size)}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 align-middle whitespace-nowrap">
                          <span className={clsx(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border",
                            img.status === 'used'
                              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                          )}>
                            <span className={clsx("w-1.5 h-1.5 rounded-full", img.status === 'used' ? "bg-emerald-500" : "bg-slate-400")} />
                            <span>{img.status === 'used' ? 'In Use' : 'Unused'}</span>
                          </span>
                        </td>

                        {/* Created */}
                        <td className="px-4 py-3 align-middle whitespace-nowrap text-slate-500 text-[11px]">
                          {formatTime(img.created)}
                        </td>

                        {/* Update Status */}
                        <td className="px-4 py-3 align-middle whitespace-nowrap">
                          {getUpdateStatusBadge(img.id) || (
                            <button
                              onClick={() => checkImageUpdate(img.id)}
                              className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              Check
                            </button>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 align-middle text-right whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-1 opacity-90 group-hover:opacity-100">
                            {/* Check Update */}
                            <button
                              onClick={() => checkImageUpdate(img.id)}
                              disabled={isDeleting || updateStatuses[img.id]?.checking}
                              className={clsx("p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-indigo-500 transition-colors", (isDeleting || updateStatuses[img.id]?.checking) && "opacity-40 cursor-not-allowed")}
                              title="Check for Updates"
                            >
                              <MagnifyingGlassIcon className={clsx("w-3.5 h-3.5", updateStatuses[img.id]?.checking && "animate-pulse")} />
                            </button>

                            {/* Pull Latest */}
                            <button
                              onClick={() => handleUpdateImage(img)}
                              disabled={isDeleting}
                              className={clsx("p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-emerald-500 transition-colors", isDeleting && "opacity-40 cursor-not-allowed")}
                              title="Pull Latest Version"
                            >
                              <ArrowUpCircleIcon className="w-3.5 h-3.5" />
                            </button>

                            {/* Inspect */}
                            <button
                              onClick={() => handleInspect(img.id)}
                              disabled={isDeleting}
                              className={clsx("p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-cyan-500 transition-colors", isDeleting && "opacity-40 cursor-not-allowed")}
                              title="Inspect JSON"
                            >
                              <EyeIcon className="w-3.5 h-3.5" />
                            </button>

                            {/* Remove */}
                            <button
                              onClick={() => handleRemoveImage(img.id)}
                              disabled={isDeleting || isSystem}
                              className={clsx(
                                "p-1.5 rounded-lg transition-colors",
                                isSystem
                                  ? "opacity-20 cursor-not-allowed text-slate-400"
                                  : isDeleting
                                    ? "opacity-40 cursor-not-allowed text-slate-400"
                                    : "hover:bg-rose-500/10 text-slate-400 hover:text-rose-500"
                              )}
                              title={isSystem ? "Protected: Conman core system image cannot be removed from itself" : "Remove Image"}
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* --- GRID / CARDS VIEW --- */}
      {!loading && viewMode === 'grid' && (
        <div className="space-y-4">
            <div className={`grid gap-6 ${
                isCollapsed 
                  ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6' 
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5'
              }`}>
                {paginatedImages.map((img) => {
                    const isDeleting = !!deletingImageIds[img.id];
                    const isSystem = isConmanSystemImage(img.repo_tags, img.id);

                    return (
                    <GlassCard 
                        key={img.id} 
                        className={clsx(
                            "p-4 relative transition-all duration-300 group overflow-hidden border border-slate-200 dark:border-white/10",
                            isDeleting ? "ring-2 ring-rose-500/50 pointer-events-none" : "hover:ring-1 hover:ring-indigo-500/30",
                            isSystem && "bg-cyan-500/[0.02]"
                        )}
                    >
                         {/* Deleting animation overlay */}
                         {isDeleting && (
                             <div className="absolute inset-0 bg-slate-900/85 backdrop-blur-[2px] z-30 flex flex-col items-center justify-center gap-2 p-3 text-center animate-fadeIn rounded-2xl">
                                 <div className="relative flex items-center justify-center">
                                     <div className="w-9 h-9 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" />
                                     <TrashIcon className="w-4 h-4 text-rose-400 absolute animate-pulse" />
                                 </div>
                                 <div>
                                     <span className="text-xs font-semibold text-rose-400 block tracking-wide">Removing Image</span>
                                     <span className="text-[10px] text-slate-400 font-mono block mt-0.5 animate-pulse">Untagging layers...</span>
                                 </div>
                             </div>
                         )}

                         {/* "In use" dot — top-left corner */}
                         {img.status === 'used' && !isDeleting && (
                             <span className="absolute top-2 left-2 flex h-2.5 w-2.5" title="Used by container">
                                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                 <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                             </span>
                         )}

                         {/* Header: name + actions */}
                         <div className="flex justify-between items-start gap-2 mb-2">
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-200 truncate" title={img.repo_tags && img.repo_tags[0]}>
                                        {img.repo_tags && img.repo_tags.length > 0 ? img.repo_tags[0].split(':')[0] : '<none>'}
                                    </h4>
                                    {isSystem && (
                                        <span className="text-[10px] font-semibold text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10 px-1.5 py-px rounded border border-cyan-200 dark:border-cyan-500/20 flex items-center gap-0.5 shrink-0" title="Protected: Conman System Image">
                                            <ShieldCheckIcon className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                                            System
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1 mt-1">
                                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500 bg-slate-100 dark:bg-slate-900/50 px-1 py-px rounded border border-slate-200 dark:border-slate-800">
                                        {img.repo_tags && img.repo_tags.length > 0 ? img.repo_tags[0].split(':')[1] || 'latest' : '<none>'}
                                    </span>
                                    {getUpdateStatusBadge(img.id)}
                                </div>
                            </div>
                            <div className="flex flex-shrink-0">
                                <button
                                    onClick={(e) => { e.stopPropagation(); checkImageUpdate(img.id); }}
                                    disabled={isDeleting || updateStatuses[img.id]?.checking}
                                    className={clsx("p-1 rounded transition-colors", updateStatuses[img.id]?.checking ? "text-blue-400" : "text-slate-400 hover:text-indigo-500", (isDeleting || updateStatuses[img.id]?.checking) && "opacity-40 cursor-not-allowed")}
                                    title="Check for Updates"
                                ><MagnifyingGlassIcon className={clsx("w-3.5 h-3.5", updateStatuses[img.id]?.checking && "animate-pulse")} /></button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleUpdateImage(img); }} 
                                    disabled={isDeleting}
                                    className={clsx("p-1 text-slate-400 hover:text-emerald-500 rounded transition-colors", isDeleting && "opacity-40 cursor-not-allowed")} 
                                    title="Pull Latest"
                                ><ArrowUpCircleIcon className="w-3.5 h-3.5" /></button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleInspect(img.id); }} 
                                    disabled={isDeleting}
                                    className={clsx("p-1 text-slate-400 hover:text-cyan-500 rounded transition-colors", isDeleting && "opacity-40 cursor-not-allowed")} 
                                    title="Inspect"
                                ><EyeIcon className="w-3.5 h-3.5" /></button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleRemoveImage(img.id); }} 
                                    disabled={isDeleting || isSystem}
                                    className={clsx(
                                        "p-1 rounded transition-colors",
                                        isSystem
                                            ? "opacity-25 cursor-not-allowed text-slate-400"
                                            : isDeleting 
                                                ? "opacity-40 cursor-not-allowed text-slate-400"
                                                : "text-slate-400 hover:text-rose-500"
                                    )} 
                                    title={isSystem ? "Protected: Conman core system image cannot be removed from itself" : "Remove"}
                                ><TrashIcon className="w-3.5 h-3.5" /></button>
                            </div>
                         </div>
                            
                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 font-mono border-t border-slate-200 dark:border-slate-700/50 pt-3">
                                <div>
                                    <span className="block text-[10px] uppercase text-slate-400 dark:text-slate-600">ID</span>
                                    <span className="truncate block">{img.id.substring(7, 15)}</span>
                                </div>
                                <div>
                                    <span className="block text-[10px] uppercase text-slate-400 dark:text-slate-600">Size</span>
                                    <span>{formatSize(img.size)}</span>
                                </div>
                                 <div className="col-span-2">
                                    <span className="block text-[10px] uppercase text-slate-400 dark:text-slate-600">Created</span>
                                    <span>{formatTime(img.created)}</span>
                                </div>
                            </div>
                    </GlassCard>
                );
                })
            }
            </div>
        </div>
      )}

      {/* Pagination */}
      <Pagination
        currentPage={page}
        totalItems={sortedImages.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
      />

      <InspectModal
        isOpen={inspectModalOpen}
        onClose={() => setInspectModalOpen(false)}
        title="Image Details"
        data={inspectData}
      />

      <ConfirmModal
          isOpen={confirmDelete.isOpen}
          onClose={() => setConfirmDelete({ isOpen: false, id: '' })}
          onConfirm={executeRemoveImage}
          title="Remove Image"
          message="Are you sure you want to remove this image? This cannot be undone."
          confirmText="Remove"
          isDestructive={true}
      />
      <ConfirmModal
          isOpen={confirmPrune}
          onClose={() => { if (!isPruning) setConfirmPrune(false); }}
          onConfirm={handlePruneImages}
          title="Prune Images"
          message="Remove all unused (dangling) images? This will delete unreferenced layers and free disk space."
          confirmText="Prune Images"
          loadingText="Pruning Layers..."
          isLoading={isPruning}
          isDestructive={true}
      />

      {/* Situational Background Activity Indicators */}
      <SituationalBanner 
          action="pruning"
          title="Pruning Unused Images"
          description="Deleting dangling layers and freeing host storage via Docker engine..."
          isVisible={isPruning}
      />
      <SituationalBanner 
          action="pulling"
          title={`Pulling ${pullImageName || 'Docker Image'}`}
          description="Streaming image manifest and unpacking layer blobs..."
          isVisible={pulling}
      />
      <SituationalBanner 
          action="updating"
          title="Checking Image Updates"
          description="Querying container registries for tag updates and hash changes..."
          isVisible={checkingAll}
      />
    </div>
  );
};

export default Images;
