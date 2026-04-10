import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassCard } from '../components/ui/GlassCard';
import { 
    CloudArrowDownIcon, 
    TrashIcon, 
    Square3Stack3DIcon, 
    ArrowPathIcon,
    EyeIcon,
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
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { clsx } from 'clsx';

interface Image {
  id: string;
  repo_tags: string[]; // Updated from tags
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
  currentTag: string | null;
  availableTag?: string | null;
}

export const Images = () => {
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [pullImageName, setPullImageName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [inspectData, setInspectData] = useState<any>(null); // Kept for modal props compatibility if needed, else remove.
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<'name' | 'size' | 'created' | 'status'>('created');
  
  // Initialize from localStorage
  const [updateStatuses, setUpdateStatuses] = useState<Record<string, UpdateStatus>>(() => {
    try {
      const saved = localStorage.getItem('conman_image_updates');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Restore Date objects and reset checking state
        Object.keys(parsed).forEach(key => {
          parsed[key].checking = false;
          if (parsed[key].lastChecked) {
            parsed[key].lastChecked = new Date(parsed[key].lastChecked);
          }
        });
        return parsed;
      }
    } catch (e) {
      console.warn("Failed to load image updates from storage", e);
    }
    return {};
  });

  // Persist to localStorage
  useEffect(() => {
    const dataToSave = { ...updateStatuses };
    // We don't need to manually convert dates, JSON.stringify handles it.
    // We might want to ensure 'checking' is false in saved data, but resolving it on load is easier.
    localStorage.setItem('conman_image_updates', JSON.stringify(dataToSave));
  }, [updateStatuses]);

  const [checkingAll, setCheckingAll] = useState(false);
  const { isCollapsed } = useSidebar();
  const { currentHost } = useHost();
  const navigate = useNavigate();

  const fetchImages = async () => {
    try {
      if (!currentHost) return;
      const endpoint = `/agents/${currentHost.id}/images`;
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
        if (!currentHost) return;
        await api.post(`/agents/${currentHost.id}/images/pull`, { image: pullImageName });
        toast.success(`Successfully pulled ${pullImageName}`, { id: toastId });
        setPullImageName('');
        fetchImages();
    } catch (error) {
        toast.error(`Failed to pull image ${pullImageName}`, { id: toastId });
    } finally {
        setPulling(false);
    }
  };

  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: string }>({ isOpen: false, id: '' });

  const handleRemoveImage = (id: string) => {
      setConfirmDelete({ isOpen: true, id });
  };

  const executeRemoveImage = async () => {
      try {
          if (!currentHost) return;
          await api.delete(`/agents/${currentHost.id}/images/${encodeURIComponent(confirmDelete.id)}`);
          toast.success('Image removed');
          fetchImages();
      } catch (error: any) {
          console.error("Remove image failed", error);
          toast.error(`Failed to remove image: ${error.response?.data || error.message}`);
      }
  };

  const handleInspect = async (id: string) => {
      try {
        // Fetch detailed inspect data
        // Backend proxy: /agents/{id}/images/{imageId} -> Agent: /api/images/inspect?id={imageId}
        if (!currentHost) return;
        const { data } = await api.get(`/agents/${currentHost.id}/images/${encodeURIComponent(id)}`);
        // data is the Inspect result
        setInspectData(data);
        setInspectModalOpen(true);
      } catch (error) {
          toast.error("Failed to inspect image");
      }
  }

  const checkImageUpdate = async (imageId: string) => {
    setUpdateStatuses(prev => ({
      ...prev,
      [imageId]: { checking: true, available: null, error: null, lastChecked: null, currentTag: null }
    }));

    try {
      if (!currentHost) return;
      // Backend: /agents/{id}/images/{imageId}/check-update -> Agent: /api/images/check-update?id={imageId}
      const { data } = await api.get(`/agents/${currentHost.id}/images/${encodeURIComponent(imageId)}/check-update`);
      setUpdateStatuses(prev => ({
        ...prev,
        [imageId]: { 
          checking: false, 
          available: data.update_available, 
          error: data.error || null,
          lastChecked: new Date(),
          currentTag: data.current_tag || null,
          availableTag: data.available_tag || null
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
          lastChecked: new Date(),
          currentTag: null
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
      if (!img.repo_tags || img.repo_tags.length === 0) continue;
      
      setUpdateStatuses(prev => ({
        ...prev,
        [img.id]: { checking: true, available: null, error: null, lastChecked: null, currentTag: null }
      }));

      try {
        if (!currentHost) continue;
        const { data } = await api.get(`/agents/${currentHost.id}/images/${encodeURIComponent(img.id)}/check-update`);
        setUpdateStatuses(prev => ({
          ...prev,
          [img.id]: { 
            checking: false, 
            available: data.update_available, 
            error: data.error || null,
            lastChecked: new Date(),
            currentTag: data.current_tag || null,
            availableTag: data.available_tag || null
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
            lastChecked: new Date(),
            currentTag: null
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
    if (!img.repo_tags || img.repo_tags.length === 0) {
      toast.error('Cannot update: image has no tag');
      return;
    }
    
    const imageName = img.repo_tags[0];
    const toastId = toast.loading(`Pulling latest ${imageName}...`);
    
    try {
      if (!currentHost) return;
      await api.post(`/agents/${currentHost.id}/images/pull`, { image: imageName });
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
      // Check for common non-critical errors (local images, auth required)
      const isSkipped = status.error.toLowerCase().includes('authentication') || 
                        status.error.toLowerCase().includes('not found') || 
                        status.error.toLowerCase().includes('manifest');
      
      if (isSkipped) {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-500/10 text-slate-500 border border-slate-500/20" title={status.error}>
              <ExclamationCircleIcon className="w-3 h-3 mr-1" />
              Local / Private
            </span>
        );
      }

      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30" title={status.error}>
          <ExclamationCircleIcon className="w-3 h-3 mr-1" />
          Error
        </span>
      );
    }
    
    if (status.available === true) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse" title="A newer version is available on the registry">
          <ArrowUpCircleIcon className="w-3 h-3 mr-1" />
          {status.availableTag ? status.availableTag : 'Update Available'}
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
          const nameA = a.repo_tags && a.repo_tags.length > 0 ? a.repo_tags[0] : a.id;
          const nameB = b.repo_tags && b.repo_tags.length > 0 ? b.repo_tags[0] : b.id;
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
          {currentHost && (
            <GlassCard className="px-3 py-1.5 flex items-center space-x-2 text-xs text-purple-400 border-purple-500/20">
              <ServerStackIcon className="w-4 h-4" />
              <span>{currentHost.name}</span>
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
       {/* Stats Grid */}
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <GlassCard className="p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Square3Stack3DIcon className="w-24 h-24 text-blue-500" />
                </div>
                <div className="relative z-10">
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Images</p>
                    <p className="text-4xl font-bold text-slate-800 dark:text-slate-100 mt-2">{images.length}</p>
                    <div className="mt-4 flex items-center text-xs text-slate-500">
                        <span className="text-blue-500 font-medium">{formatSize(images.reduce((acc, img) => acc + img.size, 0))}</span>
                        <span className="ml-1">total size</span>
                    </div>
                </div>
            </GlassCard>

            <GlassCard className="p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <ServerStackIcon className="w-24 h-24 text-emerald-500" />
                </div>
                <div className="relative z-10">
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Used Images</p>
                    <p className="text-4xl font-bold text-slate-800 dark:text-slate-100 mt-2">
                        {images.filter(img => img.status === 'used').length}
                    </p>
                     <div className="mt-4 flex items-center text-xs text-slate-500">
                        <span className="text-emerald-500 font-medium">
                            {Math.round((images.filter(img => img.status === 'used').length / (images.length || 1)) * 100)}%
                        </span>
                        <span className="ml-1">in use by containers</span>
                    </div>
                </div>
            </GlassCard>
       </div>


        {/* Pull Image Section - Local Only */}
        {/* Pull Image Section - Enabled for All Agents */}
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
                    placeholder="e.g. alpine:latest, nginx:alpine"
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

      {/* Image Grid */}
      <div className="space-y-4">
        {loading ? (
           <div className="text-slate-500 text-center py-10 animate-pulse">Loading images...</div>
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
                                  <button 
                                      onClick={(e) => { e.stopPropagation(); handleUpdateImage(img); }}
                                      className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                      title="Pull Latest Version"
                                  >
                                      <ArrowUpCircleIcon className="w-4 h-4" />
                                  </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleInspect(img.id); }}
                                    className="p-1.5 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-500/10 rounded-lg transition-colors"
                                    title="Inspect Image"
                                >
                                    <EyeIcon className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleRemoveImage(img.id); }}
                                    className="p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                                    title="Remove Image"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                         </div>
                        
                         <div>
                            <h4 className="font-semibold text-slate-900 dark:text-slate-200 truncate mb-1" title={img.repo_tags && img.repo_tags[0]}>
                                {img.repo_tags && img.repo_tags.length > 0 ? img.repo_tags[0].split(':')[0] : '<none>'}
                            </h4>
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                <span className="text-xs font-mono text-slate-600 dark:text-slate-500 bg-slate-200 dark:bg-slate-900/50 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-800">
                                    {img.repo_tags && img.repo_tags.length > 0 ? img.repo_tags[0].split(':')[1] || 'latest' : '<none>'}
                                </span>
                                {img.status === 'used' && (
                                     <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded flex items-center">Used</span>
                                )}
                                {getUpdateStatusBadge(img.id)}
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

            <ConfirmModal
                isOpen={confirmDelete.isOpen}
                onClose={() => setConfirmDelete({ isOpen: false, id: '' })}
                onConfirm={executeRemoveImage}
                title="Remove Image"
                message="Are you sure you want to remove this image? This cannot be undone."
                confirmText="Remove"
                isDestructive={true}
            />
    </div>
  );
};

export default Images;