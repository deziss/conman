import { Fragment, useState } from 'react';
import { Dialog, Transition, Tab } from '@headlessui/react';
import { ClipboardDocumentIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import api from '../services/api';

interface AddHostModalProps {
    isOpen: boolean;
    onClose: () => void;
    onHostAdded: () => void;
}

type RuntimeType = 'docker' | 'podman' | 'containerd';

const runtimeConfig: Record<RuntimeType, { label: string; color: string }> = {
    docker: { label: 'Docker', color: 'bg-blue-600' },
    podman: { label: 'Podman', color: 'bg-purple-600' },
    containerd: { label: 'Containerd', color: 'bg-amber-600' },
};

export const AddHostModal = ({ isOpen, onClose, onHostAdded }: AddHostModalProps) => {
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [runtime, setRuntime] = useState<RuntimeType>('docker');
    const [mode, setMode] = useState<'agent' | 'manual'>('agent');
    const [loading, setLoading] = useState(false);

    const serverUrl = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
    const agentName = name || 'my-agent';

    const getInstallCommand = (): string => {
        switch (runtime) {
            case 'docker':
                return `docker run -d --name conman-agent \\
  -e AGENT_NAME=${agentName} \\
  -e CONMAN_SERVER_URL=${serverUrl} \\
  -e CONMAN_SERVER_TOKEN=\${AGENT_TOKEN} \\
  -v /var/run/docker.sock:/var/run/docker.sock:ro \\
  deziss/conman-agent:latest`;
            case 'podman':
                return `podman run -d --name conman-agent \\
  -e AGENT_NAME=${agentName} \\
  -e CONMAN_SERVER_URL=${serverUrl} \\
  -e CONMAN_SERVER_TOKEN=\${AGENT_TOKEN} \\
  -e RUNTIME_TYPE=podman \\
  -v /run/podman/podman.sock:/run/podman/podman.sock:ro \\
  deziss/conman-agent:latest`;
            case 'containerd':
                return `# Download the agent binary (no Docker required)
curl -sSL https://github.com/deziss/conman-agent/releases/latest/download/conman-agent \\
  -o /usr/local/bin/conman-agent && chmod +x /usr/local/bin/conman-agent

# Create systemd service
cat <<EOF | sudo tee /etc/systemd/system/conman-agent.service
[Unit]
Description=Conman Agent (containerd)
After=containerd.service

[Service]
Environment=AGENT_NAME=${agentName}
Environment=CONMAN_SERVER_URL=${serverUrl}
Environment=CONMAN_SERVER_TOKEN=\${AGENT_TOKEN}
Environment=RUNTIME_TYPE=containerd
Environment=RUNTIME_SOCKET_PATH=/run/containerd/containerd.sock
ExecStart=/usr/local/bin/conman-agent
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now conman-agent`;
        }
    };

    const installCommand = getInstallCommand();

    const handleCopy = () => {
        navigator.clipboard.writeText(installCommand);
        toast.success("Command copied to clipboard");
    };

    const handleManualRegister = async () => {
        if (!name) return toast.error("Name is required");
        setLoading(true);
        try {
             const id = crypto.randomUUID();
             await api.post('/agents/register', {
                 agent_id: id,
                 agent_name: name,
                 mode: 'manual',
                 runtime_type: runtime,
                 scrape_url: url,
                 host_info: { runtime_type: runtime }
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

                                    {/* Runtime Selector */}
                                    <div className="mb-5">
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Container Runtime</label>
                                        <div className="flex space-x-2">
                                            {(Object.keys(runtimeConfig) as RuntimeType[]).map((rt) => (
                                                <button
                                                    key={rt}
                                                    onClick={() => setRuntime(rt)}
                                                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
                                                        runtime === rt
                                                            ? `${runtimeConfig[rt].color} text-white border-transparent shadow-lg`
                                                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white'
                                                    }`}
                                                >
                                                    {runtimeConfig[rt].label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

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
                                                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 relative group max-h-64 overflow-y-auto">
                                                         <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                            <button onClick={handleCopy} className="p-1.5 bg-slate-800 rounded hover:bg-slate-700 text-slate-300">
                                                                <ClipboardDocumentIcon className="w-4 h-4" />
                                                            </button>
                                                         </div>
                                                         <code className="text-xs font-mono text-emerald-400 break-all whitespace-pre-wrap">
                                                            {installCommand}
                                                         </code>
                                                    </div>
                                                    <p className="text-xs text-slate-500">
                                                        {runtime === 'containerd'
                                                            ? 'Run these commands on the target host. No Docker installation required — connects directly to containerd.'
                                                            : `Run this command on the target host to install and connect the ${runtimeConfig[runtime].label} agent.`
                                                        }
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
