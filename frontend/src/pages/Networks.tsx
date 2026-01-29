import { useState, useEffect, useMemo } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { 
    SignalIcon, 
    TrashIcon, 
    PlusIcon, 
    ArrowPathIcon,
    EyeIcon,
    HashtagIcon,
    ChevronUpIcon,
    ChevronDownIcon
} from '@heroicons/react/24/solid';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { InspectModal } from '../components/InspectModal';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';

interface Network {
  Id: string;
  Name: string;
  Driver: string;
  Scope: string;
  Created: string;
  Internal: boolean;
  Attachable: boolean;
  Ingress: boolean;
}

type SortField = 'Name' | 'Driver' | 'Scope' | 'Created' | 'Id';
type SortDirection = 'asc' | 'desc';

export const Networks = () => {
  const [networks, setNetworks] = useState<Network[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspectData, setInspectData] = useState<any>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  
  // Sort State
  const [sortField, setSortField] = useState<SortField>('Name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Create Form State
  const [newNetworkName, setNewNetworkName] = useState('');
  const [newNetworkDriver, setNewNetworkDriver] = useState('bridge');

  const fetchNetworks = async () => {
    try {
      const { data } = await api.get('/docker/networks');
      setNetworks(data || []);
    } catch (error) {
      console.error("Failed to fetch networks", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNetworks();
  }, []);

  const handleCreateNetwork = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newNetworkName) return;

      try {
          await api.post('/docker/networks', { 
              name: newNetworkName,
              driver: newNetworkDriver
          });
          toast.success(`Network ${newNetworkName} created`);
          setCreateModalOpen(false);
          setNewNetworkName('');
          setNewNetworkDriver('bridge');
          fetchNetworks();
      } catch (error) {
          toast.error("Failed to create network");
      }
  };

  const handleRemoveNetwork = async (id: string) => {
      if (!confirm('Are you sure you want to remove this network?')) return;
      try {
          await api.delete(`/docker/networks/${id}`);
          toast.success('Network removed');
          fetchNetworks();
      } catch (error) {
          toast.error('Failed to remove network. Ensure no containers are using it.');
      }
  };

  const handleInspect = async (id: string) => {
      try {
          const { data } = await api.get(`/docker/networks/inspect?id=${encodeURIComponent(id)}`);
          setInspectData(data);
          setInspectModalOpen(true);
      } catch (error) {
          toast.error("Failed to inspect network");
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

  const sortedNetworks = useMemo(() => {
      return [...networks].sort((a, b) => {
          let aValue = a[sortField];
          let bValue = b[sortField];

          // Handle dates or strings
          if (sortField === 'Created') {
             aValue = new Date(a.Created).getTime();
             bValue = new Date(b.Created).getTime();
          } else {
             aValue = String(aValue).toLowerCase();
             bValue = String(bValue).toLowerCase();
          }

          if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
          return 0;
      });
  }, [networks, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
      if (sortField !== field) return <div className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-50" />;
      return sortDirection === 'asc' ? 
        <ChevronUpIcon className="w-4 h-4 ml-1 text-purple-400" /> : 
        <ChevronDownIcon className="w-4 h-4 ml-1 text-purple-400" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400">
          Networks
        </h2>
        <div className="flex items-center space-x-3">
             <button 
                onClick={() => setCreateModalOpen(true)}
                className="flex items-center space-x-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-purple-500/20"
            >
                <PlusIcon className="w-5 h-5" />
                <span>Create Network</span>
            </button>
            <GlassCard className="px-4 py-2 flex items-center space-x-2 text-sm text-purple-600 dark:text-purple-400 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" role="button" onClick={fetchNetworks}>
                <ArrowPathIcon className="w-4 h-4" />
                <span>Refresh</span>
            </GlassCard>
        </div>
      </div>

      {/* Network Table */}
      <GlassCard className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-500 dark:text-slate-400">
                <thead className="bg-black/5 dark:bg-white/5 text-slate-700 dark:text-slate-200 uppercase font-medium">
                    <tr>
                        <th className="px-6 py-4 cursor-pointer group hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('Name')}>
                            <div className="flex items-center">Name <SortIcon field="Name" /></div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer group hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('Id')}>
                             <div className="flex items-center">ID <SortIcon field="Id" /></div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer group hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('Driver')}>
                             <div className="flex items-center">Driver <SortIcon field="Driver" /></div>
                        </th>
                         <th className="px-6 py-4 cursor-pointer group hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('Scope')}>
                             <div className="flex items-center">Scope <SortIcon field="Scope" /></div>
                        </th>
                         <th className="px-6 py-4 hidden md:table-cell cursor-pointer group hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('Created')}>
                             <div className="flex items-center">Created <SortIcon field="Created" /></div>
                        </th>
                        <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                    {loading ? (
                        <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500 animate-pulse">Loading networks...</td></tr>
                    ) : sortedNetworks.length === 0 ? (
                        <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No networks found.</td></tr>
                    ) : (
                        sortedNetworks.map((net) => (
                            <tr key={net.Id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
                                <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">
                                    <div className="flex items-center space-x-3">
                                        <SignalIcon className="w-5 h-5 text-purple-600 dark:text-purple-500/50" />
                                        <span title={net.Name} className="truncate max-w-[200px]">{net.Name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 font-mono text-xs text-slate-500">
                                    {net.Id.substring(0, 12)}
                                </td>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-1 rounded-md bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-white/5 text-xs">
                                        {net.Driver}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                     <span className={`px-2 py-1 rounded-md text-xs border ${
                                         net.Scope === 'local' 
                                            ? 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-white/5' 
                                            : 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20'
                                     }`}>
                                        {net.Scope}
                                    </span>
                                </td>
                                <td className="px-6 py-4 hidden md:table-cell text-xs text-slate-500">
                                    {new Date(net.Created).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end space-x-2">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleInspect(net.Id); }}
                                            className="p-1.5 text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-500/10 rounded-lg transition-colors"
                                            title="Inspect"
                                        >
                                            <EyeIcon className="w-4 h-4" />
                                        </button>
                                        {!['bridge', 'host', 'none'].includes(net.Name) && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleRemoveNetwork(net.Id); }}
                                                className="p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                                                title="Remove"
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        )}
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
        title="Network Details" 
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
                            Create Network
                        </Dialog.Title>
                        <form onSubmit={handleCreateNetwork} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
                                <input
                                    type="text"
                                    required
                                    value={newNetworkName}
                                    onChange={(e) => setNewNetworkName(e.target.value)}
                                    className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                    placeholder="my-network"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Driver</label>
                                <select
                                    value={newNetworkDriver}
                                    onChange={(e) => setNewNetworkDriver(e.target.value)}
                                    className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                >
                                    <option value="bridge">Bridge</option>
                                    <option value="host">Host</option>
                                    <option value="overlay">Overlay</option>
                                    <option value="macvlan">Macvlan</option>
                                    <option value="none">None</option>
                                </select>
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
                                    className="px-4 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors shadow-lg shadow-purple-500/20"
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
