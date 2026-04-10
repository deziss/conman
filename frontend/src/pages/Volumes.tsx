import { useState, useEffect, useMemo } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { 
    ArchiveBoxIcon, 
    TrashIcon, 
    PlusIcon, 
    ArrowPathIcon,
    EyeIcon,
    ServerIcon,
    ChevronDownIcon,
    ChevronUpIcon
} from '@heroicons/react/24/solid';
import { ServerStackIcon } from '@heroicons/react/24/outline';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { InspectModal } from '../components/InspectModal';
import { useHost } from '../contexts/HostContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { FileBrowser } from '../components/FileBrowser';
import { useCache } from '../contexts/CacheContext';

interface Volume {
  name: string;
  driver: string;
  mountpoint: string;
  created_at: string;
  scope: string;
  size?: number; // Added from System DF
  usage?: string[];
}

type SortField = 'name' | 'driver' | 'mountpoint' | 'created_at' | 'size';
type SortDirection = 'asc' | 'desc';

export const Volumes = () => {
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspectData, setInspectData] = useState<any>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);

  // Browse State
  const [browseModalOpen, setBrowseModalOpen] = useState(false);
  const [browseContainerId, setBrowseContainerId] = useState<string | null>(null);
  const [browseVolName, setBrowseVolName] = useState('');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const { currentHost } = useHost();

  // Sort State
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  // Create Form State
  const [newVolumeName, setNewVolumeName] = useState('');
  const newVolumeDriver = 'local';

  const { cache, setCache, getCache } = useCache();
  const cacheKey = `volumes-${currentHost?.id || 'local'}`;

  const fetchVolumes = async (forceRefresh = false) => {
    // Check cache
    if (!forceRefresh) {
        const cached = getCache(cacheKey);
        if (cached) {
            setVolumes(cached);
            setLoading(false);
            return;
        }
    }

    setLoading(true);
    try {
      if (!currentHost) return;
      const requests = [
          api.get(`/agents/${currentHost.id}/volumes`),
          api.get(`/agents/${currentHost.id}/system/df`)
      ];
      const [volRes, dfRes] = await Promise.all(requests);

      const volumesData: Volume[] = volRes.data || [];
      // Handle casing from legacy local endpoint if needed (PascalCase -> camelCase)
      // Agent uses lowercase protocol. Local might use PascalCase.
      // We normalize to lowercase.
      const normalizedVolumes = volumesData.map((v: any) => ({
          name: v.Name || v.name,
          driver: v.Driver || v.driver,
          mountpoint: v.Mountpoint || v.mountpoint,
          created_at: v.CreatedAt || v.created_at,
          scope: v.Scope || v.scope,
          usage: v.usage
      }));

      const dfData = dfRes ? dfRes.data : null;

      // Map usage if available
      const usageMap = new Map<string, number>();
      if (dfData && dfData.Volumes) {
          dfData.Volumes.forEach((v: any) => {
              if (v.UsageData && v.UsageData.Size !== undefined) {
                  usageMap.set(v.Name, v.UsageData.Size);
              }
          });
      }

      const merged = normalizedVolumes.map(v => ({
          ...v,
          size: usageMap.get(v.name)
      }));

      setVolumes(merged);
      setCache(cacheKey, merged); 

    } catch (error) {
      console.error("Failed to fetch volumes", error);
      toast.error("Failed to load volume data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVolumes();
  }, [currentHost]);

  const handleCreateVolume = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newVolumeName) return;

      try {
          if (!currentHost) return;
          await api.post(`/agents/${currentHost.id}/volumes`, { 
              name: newVolumeName,
              driver: newVolumeDriver
          });
          toast.success(`Volume ${newVolumeName} created`);
          setCreateModalOpen(false);
          setNewVolumeName('');
          fetchVolumes(true);
      } catch (error) {
          toast.error("Failed to create volume");
      }
  };

  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: string }>({ isOpen: false, id: '' });

  const handleRemoveVolume = (name: string) => {
      setConfirmDelete({ isOpen: true, id: name });
  };

  const executeRemoveVolume = async () => {
      try {
          if (!currentHost) return;
          await api.delete(`/agents/${currentHost.id}/volumes/${confirmDelete.id}`);
          toast.success('Volume removed');
          fetchVolumes(true);
      } catch (error) {
          toast.error('Failed to remove volume. Ensure it is not in use.');
      }
  };

  const handleInspect = async (name: string) => {
      try {
          // Use docker inspect logic? Or use object from list?
          // Agent LIST returns full objects.
          // Or we can fetch details.
          // Agent doesn't have explicit inspect endpoint for volumes other than list?
          // I added /api/volumes (list). I didn't add /api/volumes/{name}.
          // But I can just use the item from the list for now.
          const vol = volumes.find(v => v.name === name);
          setInspectData(vol);
          setInspectModalOpen(true);
      } catch (error) {
          toast.error("Failed to inspect volume");
      }
  }

  const handleDownloadVolume = async (name: string) => {
      try {
           if (!currentHost) return;
           const endpoint = `/agents/${currentHost.id}/volumes/${encodeURIComponent(name)}/browse`; 

           const { data } = await api.post(endpoint);
           if (!data.containerId) return;

           const downloadUrl = `${api.defaults.baseURL}/agents/${currentHost.id}/containers/${data.containerId}/files/download?path=/mnt/volume`;
           window.location.href = downloadUrl;
           toast.success("Download started");

      } catch (error) {
          toast.error("Failed to prepare download");
      }
  };

  const handleBrowse = async (name: string) => {
      try {
           if (!currentHost) return;
           const endpoint = `/agents/${currentHost.id}/volumes/${encodeURIComponent(name)}/browse`;

           const { data } = await api.post(endpoint);
           if (data.containerId) {
               setBrowseContainerId(data.containerId);
               setBrowseVolName(name);
               setBrowseModalOpen(true);
           }
      } catch (error) {
          console.error(error);
          toast.error("Failed to open volume browser");
      }
  };

  const handleSort = (field: SortField) => {
      if (sortField === field) {
          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
          setSortField(field);
          setSortDirection('asc');
      }
  };

  const sortedVolumes = useMemo(() => {
      return [...volumes].sort((a, b) => {
          let aValue: any = a[sortField];
          let bValue: any = b[sortField];
          
          if (sortField === 'size') {
             aValue = a.size ?? -1;
             bValue = b.size ?? -1;
             return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
          }

          if (sortField === 'created_at') {
             aValue = new Date(a.created_at || 0).getTime();
             bValue = new Date(b.created_at || 0).getTime();
          } else {
             aValue = String(aValue || '').toLowerCase();
             bValue = String(bValue || '').toLowerCase();
          }

          if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
          return 0;
      });
  }, [volumes, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
      if (sortField !== field) return <div className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-50" />;
      return sortDirection === 'asc' ? 
        <ChevronUpIcon className="w-4 h-4 ml-1 text-amber-400" /> : 
        <ChevronDownIcon className="w-4 h-4 ml-1 text-amber-400" />;
  };

  const formatSize = (bytes?: number) => {
      if (bytes === undefined || bytes === null) return 'N/A';
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400">
          Volumes
        </h2>
        <div className="flex items-center space-x-3">
             {currentHost && (
                <GlassCard className="px-3 py-1.5 flex items-center space-x-2 text-xs text-purple-400 border-purple-500/20">
                    <ServerStackIcon className="w-4 h-4" />
                    <span>{currentHost.name}</span>
                </GlassCard>
            )}
            
             <button 
                onClick={() => setCreateModalOpen(true)}
                className="flex items-center space-x-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-amber-500/20"
            >
                <PlusIcon className="w-5 h-5" />
                <span>Create Volume</span>
            </button>
            
            <GlassCard className="px-4 py-2 flex items-center space-x-2 text-sm text-amber-600 dark:text-amber-400 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" role="button" onClick={() => fetchVolumes(true)}>
                <ArrowPathIcon className="w-4 h-4" />
                <span>Refresh</span>
            </GlassCard>
        </div>
      </div>

      {/* Volume Table */}
      <GlassCard className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-500 dark:text-slate-400">
                <thead className="bg-black/5 dark:bg-white/5 text-slate-700 dark:text-slate-200 uppercase font-medium">
                    <tr>
                        <th className="px-6 py-4 cursor-pointer group hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('name')}>
                            <div className="flex items-center">Name <SortIcon field="name" /></div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer group hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('driver')}>
                             <div className="flex items-center">Driver <SortIcon field="driver" /></div>
                        </th>
                         <th className="px-6 py-4 cursor-pointer group hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('mountpoint')}>
                             <div className="flex items-center">Mountpoint <SortIcon field="mountpoint" /></div>
                        </th>
                         <th className="px-6 py-4 cursor-pointer group hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('size')}>
                             <div className="flex items-center">Size <SortIcon field="size" /></div>
                        </th>
                         <th className="px-6 py-4 hidden md:table-cell">
                             <div className="flex items-center">Used By</div>
                        </th>
                         <th className="px-6 py-4 hidden md:table-cell cursor-pointer group hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('created_at')}>
                             <div className="flex items-center">Created <SortIcon field="created_at" /></div>
                        </th>
                        <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                    {loading ? (
                        <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500 animate-pulse">Loading volumes...</td></tr>
                    ) : sortedVolumes.length === 0 ? (
                        <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500">No volumes found.</td></tr>
                    ) : (
                        sortedVolumes.map((vol) => (
                            <tr key={vol.name} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
                                <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">
                                    <div className="flex items-center space-x-3">
                                        <ArchiveBoxIcon className="w-5 h-5 text-amber-600 dark:text-amber-500/50" />
                                        <span title={vol.name} className="truncate max-w-[200px]">{vol.name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                     <span className="px-2 py-1 rounded-md bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-white/5 text-xs">
                                        {vol.driver}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-mono text-xs text-slate-600 dark:text-slate-500">
                                    <div className="flex items-center space-x-2">
                                        <ServerIcon className="w-3 h-3 text-slate-500 dark:text-slate-600" />
                                        <span className="truncate max-w-[250px]" title={vol.mountpoint}>{vol.mountpoint}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 font-mono text-xs text-slate-600 dark:text-slate-500">
                                    {formatSize(vol.size)}
                                </td>
                                <td className="px-6 py-4 hidden md:table-cell text-xs text-slate-500">
                                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                                        {vol.usage && vol.usage.length > 0 ? vol.usage.slice(0, 3).map(u => (
                                            <span key={u} className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                                                {u}
                                            </span>
                                        )) : <span className="text-slate-400 italic">Unused</span>}
                                        {vol.usage && vol.usage.length > 3 && (
                                            <span className="px-1.5 py-0.5 text-slate-400">+{vol.usage.length - 3}</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 hidden md:table-cell text-xs text-slate-500">
                                    {vol.created_at ? new Date(vol.created_at).toLocaleDateString() : 'N/A'}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end space-x-2">
                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                handleInspect(vol.name); 
                                            }}
                                            className="p-1.5 text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-500/10 rounded-lg transition-colors"
                                            title="Inspect"
                                        >
                                            <EyeIcon className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleBrowse(vol.name); }}
                                            title="Browse Files" 
                                            className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/10 rounded-lg transition-colors"
                                        >
                                           <ServerStackIcon className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDownloadVolume(vol.name); }}
                                            title="Download Volume" 
                                            className="p-1.5 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/10 rounded-lg transition-colors"
                                        >
                                           <ArrowPathIcon className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleRemoveVolume(vol.name); }}
                                            className="p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                                            title="Remove"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
          </div>
      </GlassCard>

      <InspectModal 
        isOpen={inspectModalOpen} 
        onClose={() => setInspectModalOpen(false)} 
        title="Volume Details" 
        data={inspectData} 
      />

      {/* Create Modal */}
      <Transition.Root show={createModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={setCreateModalOpen}>
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
            <div className="fixed inset-0 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4">
                    <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-slate-900 border border-white/10 p-6 text-left align-middle shadow-xl transition-all">
                        <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-white mb-4">
                            Create Volume
                        </Dialog.Title>
                        <form onSubmit={handleCreateVolume} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
                                <input
                                    type="text"
                                    required
                                    value={newVolumeName}
                                    onChange={(e) => setNewVolumeName(e.target.value)}
                                    className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                                    placeholder="my-volume"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Driver</label>
                                <input
                                    type="text"
                                    readOnly
                                    value="local"
                                    className="w-full bg-slate-800/20 border border-white/5 rounded-lg px-4 py-2 text-slate-500 cursor-not-allowed"
                                />
                            </div>
                            <div className="mt-6 flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setCreateModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shadow-lg shadow-amber-500/20"
                                >
                                    Create
                                </button>
                            </div>
                        </form>
                    </Dialog.Panel>
                </div>
            </div>
        </Dialog>
      </Transition.Root>

            <ConfirmModal
                isOpen={confirmDelete.isOpen}
                onClose={() => setConfirmDelete({ isOpen: false, id: '' })}
                onConfirm={executeRemoveVolume}
                title="Remove Volume"
                message="Are you sure you want to remove this volume? This action is irreversible."
                confirmText="Remove"
                isDestructive={true}
            />

      {/* Browse Modal */}
      <Transition.Root show={browseModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={setBrowseModalOpen}>
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
            <div className="fixed inset-0 overflow-hidden flex justify-center items-center p-4">
                 <Dialog.Panel className="w-full max-w-5xl h-[80vh] transform overflow-hidden rounded-2xl bg-slate-900 border border-white/10 text-left align-middle shadow-xl transition-all flex flex-col">
                      <div className="flex justify-between items-center p-4 border-b border-white/5 bg-slate-800/50">
                          <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-white flex items-center space-x-2">
                              <ServerStackIcon className="w-5 h-5 text-amber-500" />
                              <span>Browsing: {browseVolName}</span>
                          </Dialog.Title>
                          <button onClick={() => setBrowseModalOpen(false)} className="text-slate-400 hover:text-white">
                              <span className="sr-only">Close</span>
                              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                          </button>
                      </div>
                      <div className="flex-1 overflow-hidden bg-slate-900">
                          {browseContainerId && <FileBrowser containerId={browseContainerId} />}
                      </div>
                 </Dialog.Panel>
            </div>
        </Dialog>
      </Transition.Root>
    </div>
  );
};
