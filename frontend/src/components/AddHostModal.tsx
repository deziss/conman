import { Fragment, useState } from 'react';
import { Dialog, Transition, Tab } from '@headlessui/react';
import { GlassCard } from './ui/GlassCard';
import { ClipboardDocumentIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import api from '../services/api';

interface AddHostModalProps {
    isOpen: boolean;
    onClose: () => void;
    onHostAdded: () => void;
}

export const AddHostModal = ({ isOpen, onClose, onHostAdded }: AddHostModalProps) => {
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [mode, setMode] = useState<'agent' | 'manual'>('agent'); // agent = copy command, manual = enter URL (for scrape)
    const [loading, setLoading] = useState(false);

    const serverUrl = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
    const dockerCommand = `docker run -d --name conman-agent \\
  -e AGENT_NAME=${name || 'my-agent'} \\
  -e CONMAN_SERVER_URL=${serverUrl} \\
  -v /var/run/docker.sock:/var/run/docker.sock:ro \\
  deziss/conman-agent:latest`;

    const handleCopy = () => {
        navigator.clipboard.writeText(dockerCommand);
        toast.success("Command copied to clipboard");
    };

    const handleManualRegister = async () => {
        if (!name) return toast.error("Name is required");
        // Manual scraping isn't fully supported by backend yet, but we can register abstract agent
        setLoading(true);
        try {
             // Mocking ID generation
             const id = crypto.randomUUID();
             await api.post('/agents/register', {
                 agent_id: id,
                 agent_name: name,
                 mode: 'manual',
                 scrape_url: url,
                 host_info: {} 
             });
             toast.success("Host registered successfully");
             onHostAdded();
             onClose();
        } catch (error) {
            toast.error("Failed to register host");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Transition.Root show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                 <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" />
                </Transition.Child>

                <div className="fixed inset-0 z-10 overflow-y-auto">
                    <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            enterTo="opacity-100 translate-y-0 sm:scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        >
                            <Dialog.Panel className="relative transform overflow-hidden rounded-xl bg-slate-900 border border-slate-700 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-xl">
                                <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                                    <button
                                        type="button"
                                        className="rounded-md text-slate-400 hover:text-slate-200 focus:outline-none"
                                        onClick={onClose}
                                    >
                                        <span className="sr-only">Close</span>
                                        <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                                    </button>
                                </div>
                                
                                <div className="p-6">
                                    <Dialog.Title as="h3" className="text-xl font-semibold leading-6 text-white mb-6">
                                        Add New Host
                                    </Dialog.Title>

                                    <Tab.Group onChange={(idx) => setMode(idx === 0 ? 'agent' : 'manual')}>
                                        <Tab.List className="flex space-x-1 rounded-xl bg-slate-800 p-1 mb-6">
                                            {['Connect Agent', 'Manual Registration'].map((category) => (
                                                <Tab
                                                    key={category}
                                                    className={({ selected }) =>
                                                        `w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-cyan-500 ring-white ring-opacity-60 ring-offset-2 ring-offset-cyan-400 focus:outline-none focus:ring-2
                                                        ${selected ? 'bg-slate-700 shadow' : 'text-slate-400 hover:bg-white/[0.12] hover:text-white'}`
                                                    }
                                                >
                                                    {category}
                                                </Tab>
                                            ))}
                                        </Tab.List>
                                        <Tab.Panels>
                                            <Tab.Panel>
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-300 mb-1">Agent Name</label>
                                                        <input 
                                                            type="text" 
                                                            value={name}
                                                            onChange={(e) => setName(e.target.value)}
                                                            className="w-full bg-slate-800 border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-cyan-500 focus:border-cyan-500"
                                                            placeholder="e.g. production-db-01"
                                                        />
                                                    </div>
                                                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 relative group">
                                                         <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={handleCopy} className="p-1.5 bg-slate-800 rounded hover:bg-slate-700 text-slate-300">
                                                                <ClipboardDocumentIcon className="w-4 h-4" />
                                                            </button>
                                                         </div>
                                                         <code className="text-xs font-mono text-emerald-400 break-all whitespace-pre-wrap">
                                                            {dockerCommand}
                                                         </code>
                                                    </div>
                                                    <p className="text-xs text-slate-500">
                                                        Run this command on the target host to install and connect the agent.
                                                    </p>
                                                </div>
                                            </Tab.Panel>
                                            <Tab.Panel>
                                                 <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-300 mb-1">Host Name</label>
                                                        <input 
                                                            type="text" 
                                                            value={name}
                                                            onChange={(e) => setName(e.target.value)}
                                                            className="w-full bg-slate-800 border-slate-700 rounded-lg text-white"
                                                            placeholder="e.g. legacy-server"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-300 mb-1">Scrape URL (Optional)</label>
                                                        <input 
                                                            type="text" 
                                                            value={url}
                                                            onChange={(e) => setUrl(e.target.value)}
                                                            className="w-full bg-slate-800 border-slate-700 rounded-lg text-white"
                                                            placeholder="http://192.168.1.50:9090"
                                                        />
                                                    </div>
                                                    <div className="pt-4 flex justify-end">
                                                        <button
                                                            onClick={handleManualRegister}
                                                            disabled={loading || !name}
                                                            className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                                                        >
                                                            {loading ? 'Registering...' : 'Register Host'}
                                                        </button>
                                                    </div>
                                                 </div>
                                            </Tab.Panel>
                                        </Tab.Panels>
                                    </Tab.Group>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    );
};
