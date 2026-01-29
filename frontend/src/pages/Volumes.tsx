import { useState, useEffect, useMemo } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { 
    ArchiveBoxIcon, 
    TrashIcon, 
    PlusIcon, 
    ArrowPathIcon,
    EyeIcon,
    ServerIcon,
    ChevronUpIcon,
    ChevronDownIcon
} from '@heroicons/react/24/solid';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { InspectModal } from '../components/InspectModal';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';

interface Volume {
  Name: string;
  Driver: string;
  Mountpoint: string;
  CreatedAt: string;
  Scope: string;
}

type SortField = 'Name' | 'Driver' | 'Mountpoint' | 'CreatedAt';
type SortDirection = 'asc' | 'desc';

export const Volumes = () => {
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspectData, setInspectData] = useState<any>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Sort State
  const [sortField, setSortField] = useState<SortField>('Name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  // Create Form State
  const [newVolumeName, setNewVolumeName] = useState('');
  const [newVolumeDriver, setNewVolumeDriver] = useState('local');

  const fetchVolumes = async () => {
    try {
      const { data } = await api.get('/docker/volumes');
      setVolumes(data || []);
    } catch (error) {
      console.error("Failed to fetch volumes", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVolumes();
  }, []);

  const handleCreateVolume = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newVolumeName) return;

      try {
          await api.post('/docker/volumes', { 
              name: newVolumeName,
              driver: newVolumeDriver
          });
          toast.success(`Volume ${newVolumeName} created`);
          setCreateModalOpen(false);
          setNewVolumeName('');
          fetchVolumes();
      } catch (error) {
          toast.error("Failed to create volume");
      }
  };

  const handleRemoveVolume = async (name: string) => {
      if (!confirm('Are you sure you want to remove this volume? Action is irreversible.')) return;
      try {
          await api.delete(`/docker/volumes/${name}`);
          toast.success('Volume removed');
          fetchVolumes();
      } catch (error) {
          toast.error('Failed to remove volume. Ensure it is not in use.');
      }
  };

  const handleInspect = async (name: string) => {
      try {
          const { data } = await api.get(`/docker/volumes/inspect?id=${encodeURIComponent(name)}`);
          setInspectData(data);
          setInspectModalOpen(true);
      } catch (error) {
          toast.error("Failed to inspect volume");
      }
  }

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
          let aValue = a[sortField];
          let bValue = b[sortField];

          // Handle dates or strings
          if (sortField === 'CreatedAt') {
             aValue = new Date(a.CreatedAt || 0).getTime();
             bValue = new Date(b.CreatedAt || 0).getTime();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400">
          Volumes
        </h2>
        <div className="flex items-center space-x-3">
             <button 
                onClick={() => setCreateModalOpen(true)}
                className="flex items-center space-x-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-amber-500/20"
            >
                <PlusIcon className="w-5 h-5" />
                <span>Create Volume</span>
            </button>
            <GlassCard className="px-4 py-2 flex items-center space-x-2 text-sm text-amber-600 dark:text-amber-400 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" role="button" onClick={fetchVolumes}>
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
                        <th className="px-6 py-4 cursor-pointer group hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('Name')}>
                            <div className="flex items-center">Name <SortIcon field="Name" /></div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer group hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('Driver')}>
                             <div className="flex items-center">Driver <SortIcon field="Driver" /></div>
                        </th>
                         <th className="px-6 py-4 cursor-pointer group hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('Mountpoint')}>
                             <div className="flex items-center">Mountpoint <SortIcon field="Mountpoint" /></div>
                        </th>
                         <th className="px-6 py-4 hidden md:table-cell cursor-pointer group hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('CreatedAt')}>
                             <div className="flex items-center">Created <SortIcon field="CreatedAt" /></div>
                        </th>
                        <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                    {loading ? (
                        <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500 animate-pulse">Loading volumes...</td></tr>
                    ) : sortedVolumes.length === 0 ? (
                        <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No volumes found.</td></tr>
                    ) : (
                        sortedVolumes.map((vol) => (
                            <tr key={vol.Name} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
                                <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">
                                    <div className="flex items-center space-x-3">
                                        <ArchiveBoxIcon className="w-5 h-5 text-amber-600 dark:text-amber-500/50" />
                                        <span title={vol.Name} className="truncate max-w-[200px]">{vol.Name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                     <span className="px-2 py-1 rounded-md bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-white/5 text-xs">
                                        {vol.Driver}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-mono text-xs text-slate-600 dark:text-slate-500">
                                    <div className="flex items-center space-x-2">
                                        <ServerIcon className="w-3 h-3 text-slate-500 dark:text-slate-600" />
                                        <span className="truncate max-w-[250px]" title={vol.Mountpoint}>{vol.Mountpoint}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 hidden md:table-cell text-xs text-slate-500">
                                    {vol.CreatedAt ? new Date(vol.CreatedAt).toLocaleDateString() : 'N/A'}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end space-x-2">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleInspect(vol.Name); }}
                                            className="p-1.5 text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-500/10 rounded-lg transition-colors"
                                            title="Inspect"
                                        >
                                            <EyeIcon className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleRemoveVolume(vol.Name); }}
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
    </div>
  );
};
