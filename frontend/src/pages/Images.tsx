import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassCard } from '../components/ui/GlassCard';
import { 
    CloudArrowDownIcon, 
    TrashIcon, 
    Square3Stack3DIcon, 
    ArrowPathIcon,
    TagIcon,
    ClockIcon,
    EyeIcon,
    TableCellsIcon,
    ListBulletIcon,
    ArrowUpCircleIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,

    MagnifyingGlassIcon,
    ServerStackIcon
} from '@heroicons/react/24/solid';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { InspectModal } from '../components/InspectModal';
import { useSidebar } from '../layouts/DashboardLayout';
import { useHost } from '../contexts/HostContext';
import { clsx } from 'clsx';

interface Image {
  id: string;
  repo: string;
  tags: string[];
  size: number;
  created: number;
  status: string; // "used" | "unused"
  update_available: boolean;
}

interface UpdateStatus {
  checking: boolean;
  available: boolean | null;
  error: string | null;
  lastChecked: Date | null;
}

export const Images = () => {
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [pullImageName, setPullImageName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [inspectData, setInspectData] = useState<any>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<'name' | 'size' | 'created' | 'status'>('created');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [updateStatuses, setUpdateStatuses] = useState<Record<string, UpdateStatus>>({});
  const [checkingAll, setCheckingAll] = useState(false);
  const { isCollapsed } = useSidebar();
  const { currentHost, isLocalHost } = useHost();
  const navigate = useNavigate();

  const fetchImages = async () => {
    try {
      const endpoint = isLocalHost ? '/docker/images' : `/agents/${currentHost?.id}/images`;
      const { data } = await api.get(endpoint);
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

  const handlePullImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pullImageName) return;

    setPulling(true);
    const toastId = toast.loading(`Pulling image ${pullImageName}...`);

    try {
        await api.post('/docker/images/pull', { image: pullImageName });
        toast.success(`Successfully pulled ${pullImageName}`, { id: toastId });
        setPullImageName('');
        fetchImages();
    } catch (error) {
        toast.error(`Failed to pull image ${pullImageName}`, { id: toastId });
    } finally {
        setPulling(false);
    }
  };

  const handleRemoveImage = async (id: string) => {
      if (!confirm('Are you sure you want to remove this image?')) return;
      try {
          await api.delete(`/docker/images/${id}`);
          toast.success('Image removed');
          fetchImages();
      } catch (error) {
          toast.error('Failed to remove image');
      }
  };

  const handleInspect = async (id: string) => {
      navigate(`/images/${encodeURIComponent(id)}`);
  }

  const checkImageUpdate = async (imageId: string) => {
    setUpdateStatuses(prev => ({
      ...prev,
      [imageId]: { checking: true, available: null, error: null, lastChecked: null }
    }));

    try {
      const { data } = await api.get(`/docker/images/${encodeURIComponent(imageId)}/check-update`);
      setUpdateStatuses(prev => ({
        ...prev,
        [imageId]: { 
          checking: false, 
          available: data.update_available, 
          error: data.error || null,
          lastChecked: new Date()
        }
      }));
      
      if (data.update_available) {
        toast.success('Update available!');
      } else if (data.error) {
        toast.error(`Check failed: ${data.error}`);
      } else {
        toast('Image is up to date', { icon: '✓' });
      }
    } catch (error: any) {
      setUpdateStatuses(prev => ({
        ...prev,
        [imageId]: { 
          checking: false, 
          available: null, 
          error: error.message || 'Failed to check',
          lastChecked: new Date()
        }
      }));
      toast.error('Failed to check for updates');
    }
  };

  const checkAllUpdates = async () => {
    setCheckingAll(true);
    const toastId = toast.loading('Checking all images for updates...');
    
    let updatesFound = 0;
    let errors = 0;
    
    for (const img of images) {
      if (!img.tags || img.tags.length === 0) continue;
      
      setUpdateStatuses(prev => ({
        ...prev,
        [img.id]: { checking: true, available: null, error: null, lastChecked: null }
      }));

      try {
        const { data } = await api.get(`/docker/images/${encodeURIComponent(img.id)}/check-update`);
        setUpdateStatuses(prev => ({
          ...prev,
          [img.id]: { 
            checking: false, 
            available: data.update_available, 
            error: data.error || null,
            lastChecked: new Date()
          }
        }));
        if (data.update_available) updatesFound++;
        if (data.error) errors++;
      } catch (error: any) {
        setUpdateStatuses(prev => ({
          ...prev,
          [img.id]: { 
            checking: false, 
            available: null, 
            error: error.message || 'Failed',
            lastChecked: new Date()
          }
        }));
        errors++;
      }
    }
    
    setCheckingAll(false);
    if (updatesFound > 0) {
      toast.success(`Found ${updatesFound} image(s) with updates available`, { id: toastId });
    } else if (errors > 0) {
      toast.error(`Check complete with ${errors} error(s)`, { id: toastId });
    } else {
      toast.success('All images are up to date!', { id: toastId });
    }
  };

  const handleUpdateImage = async (img: Image) => {
    if (!img.tags || img.tags.length === 0) {
      toast.error('Cannot update: image has no tag');
      return;
    }
    
    const imageName = img.tags[0];
    const toastId = toast.loading(`Pulling latest ${imageName}...`);
    
    try {
      await api.post('/docker/images/pull', { image: imageName });
      toast.success(`Successfully updated ${imageName}`, { id: toastId });
      
      // Clear update status and refresh
      setUpdateStatuses(prev => {
        const newState = { ...prev };
        delete newState[img.id];
        return newState;
      });
      fetchImages();
    } catch (error) {
      toast.error(`Failed to update ${imageName}`, { id: toastId });
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1000;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (created: number) => {
      return new Date(created * 1000).toLocaleDateString();
  }

  const getUpdateStatusBadge = (imageId: string) => {
    const status = updateStatuses[imageId];
    if (!status) return null;
    
    if (status.checking) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse">
          <ArrowPathIcon className="w-3 h-3 mr-1 animate-spin" />
          Checking...
        </span>
      );
    }
    
    if (status.error) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30" title={status.error}>
          <ExclamationCircleIcon className="w-3 h-3 mr-1" />
          Error
        </span>
      );
    }
    
    if (status.available === true) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
          <ArrowUpCircleIcon className="w-3 h-3 mr-1" />
          Update Available
        </span>
      );
    }
    
    if (status.available === false) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-500/20 text-slate-400 border border-slate-500/30">
          <CheckCircleIcon className="w-3 h-3 mr-1" />
          Up to date
        </span>
      );
    }
    
    return null;
  };

  const sortedImages = [...images].sort((a, b) => {
      if (sortOrder === 'name') {
          const nameA = a.tags && a.tags.length > 0 ? a.tags[0] : a.id;
          const nameB = b.tags && b.tags.length > 0 ? b.tags[0] : b.id;
          return nameA.localeCompare(nameB);
      }
      if (sortOrder === 'size') return b.size - a.size;
      if (sortOrder === 'created') return b.created - a.created;
      if (sortOrder === 'status') {
          // Used first
          if (a.status === 'used' && b.status !== 'used') return -1;
          if (a.status !== 'used' && b.status === 'used') return 1;
          return 0;
      }
      return 0;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">

        <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-500 dark:from-slate-100 dark:to-slate-400">
          Images
        </h2>
        <div className="flex items-center space-x-2">
          {!isLocalHost && (
            <GlassCard className="px-3 py-1.5 flex items-center space-x-2 text-xs text-purple-400 border-purple-500/20">
              <ServerStackIcon className="w-4 h-4" />
              <span>{currentHost?.name}</span>
            </GlassCard>
          )}
          <GlassCard 
            className={clsx(
              "px-4 py-2 flex items-center space-x-2 text-sm cursor-pointer transition-colors",
              checkingAll 
                ? "text-blue-400 bg-blue-500/10" 
                : "text-purple-600 dark:text-purple-400 hover:bg-black/5 dark:hover:bg-white/5"
            )} 
            role="button" 
            onClick={checkAllUpdates}
          >
              <MagnifyingGlassIcon className={clsx("w-4 h-4", checkingAll && "animate-pulse")} />
              <span>{checkingAll ? 'Checking...' : 'Check All Updates'}</span>
          </GlassCard>
          <GlassCard className="px-4 py-2 flex items-center space-x-2 text-sm text-cyan-600 dark:text-cyan-400 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" role="button" onClick={fetchImages}>
              <ArrowPathIcon className="w-4 h-4" />
              <span>Refresh</span>
          </GlassCard>
        </div>
      </div>

        {/* Pull Image Section */}
        <GlassCard className="p-6">
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-200 mb-4 flex items-center">
                <CloudArrowDownIcon className="w-5 h-5 mr-2 text-cyan-600 dark:text-cyan-400" />
                Pull New Image
            </h3>
            <form onSubmit={handlePullImage} className="flex gap-4">
                <input 
                    type="text" 
                    value={pullImageName}
                    onChange={(e) => setPullImageName(e.target.value)}
                    placeholder="e.g. alpine:latest, nginx:alpine, ghcr.io/user/repo:tag"
                    className="flex-1 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg px-4 py-2 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
                />
                <button 
                    type="submit" 
                    disabled={pulling || !pullImageName}
                    className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium transition-all shadow-lg shadow-cyan-500/20 flex items-center"
                >
                    {pulling ? 'Pulling...' : 'Pull Image'}
                </button>
            </form>
            <p className="text-xs text-slate-500 mt-2">
              Supports Docker Hub, GitHub Container Registry (ghcr.io), and private registries
            </p>
        </GlassCard>

        {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-8 mb-4 gap-4">
        <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-300">Image List</h3>
        
        <div className="flex items-center space-x-4">
           {/* View Toggle */}
           <div className="flex bg-white dark:bg-slate-800/50 rounded-lg p-1 border border-slate-200 dark:border-slate-700/50">
                <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-md transition-all ${
                        viewMode === 'list'
                        ? 'bg-cyan-500/10 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700/50'
                    }`}
                    title="List View"
                >
                    <ListBulletIcon className="w-4 h-4" />
                </button>
                <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-md transition-all ${
                        viewMode === 'grid'
                        ? 'bg-cyan-500/10 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700/50'
                    }`}
                    title="Grid View"
                >
                    <TableCellsIcon className="w-4 h-4" />
                </button>
           </div>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 text-xs rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block p-2 outline-none"
          >
            <option value="created">Sort by Created</option>
            <option value="name">Sort by Name</option>
            <option value="size">Sort by Size</option>
            <option value="status">Sort by Status</option>
          </select>
        </div>
      </div>

      {/* Image List */}
      <div className="space-y-4">
        {loading ? (
           <div className="text-slate-500 text-center py-10 animate-pulse">Loading images...</div>
        ) : viewMode === 'list' ? (
            sortedImages.map((img) => (
                <GlassCard key={img.id} className="p-4 flex items-center justify-between group hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <div className="flex items-center space-x-4 overflow-hidden">
                        <div className="p-3 bg-slate-100 dark:bg-slate-800/50 rounded-lg relative">
                            <Square3Stack3DIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                            {img.status === 'used' && (
                                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                </span>
                            )}
                            {updateStatuses[img.id]?.available && (
                                <span className="absolute -top-1 -left-1 flex h-3 w-3">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                                </span>
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2">
                                <h4 className="font-semibold text-slate-900 dark:text-slate-200 truncate" title={img.tags && img.tags[0]}>
                                    {img.tags && img.tags.length > 0 ? img.tags[0].split(':')[0] : '<none>'}
                                </h4>
                                <span className="text-xs font-mono text-slate-600 dark:text-slate-500 bg-slate-200 dark:bg-slate-900/50 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-800">
                                    {img.tags && img.tags.length > 0 ? img.tags[0].split(':')[1] || 'latest' : '<none>'}
                                </span>
                                {img.status === 'used' && (
                                     <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-1.5 rounded">Used</span>
                                )}
                                {getUpdateStatusBadge(img.id)}
                            </div>
                             <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 font-mono">
                                <span className="flex items-center">
                                    <TagIcon className="w-3 h-3 mr-1" />
                                    {img.id.substring(7, 19)}
                                </span>
                                <span className="flex items-center">
                                    <ClockIcon className="w-3 h-3 mr-1" />
                                    {formatTime(img.created)}
                                </span>
                                <span>
                                    {formatSize(img.size)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="ml-4 flex items-center space-x-2">
                        {/* Check Update Button */}
                        <button 
                            onClick={(e) => { e.stopPropagation(); checkImageUpdate(img.id); }}
                            disabled={updateStatuses[img.id]?.checking}
                            className={clsx(
                              "p-2 rounded-lg transition-colors",
                              updateStatuses[img.id]?.checking 
                                ? "text-blue-400 bg-blue-500/10" 
                                : "text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-500/10"
                            )}
                            title="Check for Updates"
                        >
                            <MagnifyingGlassIcon className={clsx("w-5 h-5", updateStatuses[img.id]?.checking && "animate-pulse")} />
                        </button>
                        
                        {/* Update Button - Show when update available */}
                        {updateStatuses[img.id]?.available && (
                          <button 
                              onClick={(e) => { e.stopPropagation(); handleUpdateImage(img); }}
                              className="p-2 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                              title="Pull Latest Version"
                          >
                              <ArrowUpCircleIcon className="w-5 h-5" />
                          </button>
                        )}
                        
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleInspect(img.id); }}
                            className="p-2 text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-500/10 rounded-lg transition-colors"
                            title="Inspect Image"
                        >
                            <EyeIcon className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleRemoveImage(img.id); }}
                            className="p-2 text-slate-500 hover:text-rose-600 dark:hover:text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                            title="Remove Image"
                        >
                            <TrashIcon className="w-5 h-5" />
                        </button>
                    </div>
                </GlassCard>
            ))
        ) : (
            <div className={`grid gap-6 ${
                isCollapsed 
                  ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6' 
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5'
              }`}>
                {sortedImages.map((img) => (
                    <GlassCard key={img.id} className="p-4 flex flex-col justify-between group h-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors relative overflow-hidden">
                         <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-slate-100 dark:bg-slate-800/50 rounded-lg relative">
                                <Square3Stack3DIcon className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                                {img.status === 'used' && (
                                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                    </span>
                                )}
                                {updateStatuses[img.id]?.available && (
                                    <span className="absolute -top-1 -left-1 flex h-3 w-3">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                                    </span>
                                )}
                            </div>
                            <div className="flex space-x-1">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); checkImageUpdate(img.id); }}
                                    disabled={updateStatuses[img.id]?.checking}
                                    className={clsx(
                                      "p-1.5 rounded-lg transition-colors",
                                      updateStatuses[img.id]?.checking 
                                        ? "text-blue-400 bg-blue-500/10" 
                                        : "text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-500/10"
                                    )}
                                    title="Check for Updates"
                                >
                                    <MagnifyingGlassIcon className={clsx("w-4 h-4", updateStatuses[img.id]?.checking && "animate-pulse")} />
                                </button>
                                {updateStatuses[img.id]?.available && (
                                  <button 
                                      onClick={(e) => { e.stopPropagation(); handleUpdateImage(img); }}
                                      className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                      title="Pull Latest Version"
                                  >
                                      <ArrowUpCircleIcon className="w-4 h-4" />
                                  </button>
                                )}
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleInspect(img.id); }}
                                    className="p-1.5 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-500/10 rounded-lg transition-colors"
                                    title="Inspect Image"
                                >
                                    <EyeIcon className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleRemoveImage(img.id); }}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                                    title="Remove Image"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                         </div>
                        
                         <div>
                            <h4 className="font-semibold text-slate-900 dark:text-slate-200 truncate mb-1" title={img.tags && img.tags[0]}>
                                {img.tags && img.tags.length > 0 ? img.tags[0].split(':')[0] : '<none>'}
                            </h4>
                            <div className="flex flex-wrap gap-2 mb-3">
                                <span className="text-xs font-mono text-slate-600 dark:text-slate-500 bg-slate-200 dark:bg-slate-900/50 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-800">
                                    {img.tags && img.tags.length > 0 ? img.tags[0].split(':')[1] || 'latest' : '<none>'}
                                </span>
                                {img.status === 'used' && (
                                     <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded flex items-center">Used</span>
                                )}
                            </div>
                            
                            {/* Update Status Badge for Grid View */}
                            {getUpdateStatusBadge(img.id) && (
                              <div className="mb-3">
                                {getUpdateStatusBadge(img.id)}
                              </div>
                            )}
                            
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
                         </div>
                    </GlassCard>
                ))
            }
            </div>
        )}
      </div>

      <InspectModal 
        isOpen={inspectModalOpen} 
        onClose={() => setInspectModalOpen(false)} 
        title="Image Details" 
        data={inspectData} 
      />
    </div>
  );
};

export default Images;