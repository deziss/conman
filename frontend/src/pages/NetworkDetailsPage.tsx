import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { 
    SignalIcon, 
    ArrowLeftIcon, 
    TrashIcon, 
    ClockIcon, 
    HashtagIcon, 
    GlobeAltIcon,
    ServerIcon,
    ShieldCheckIcon,
    InformationCircleIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useHost } from '../contexts/HostContext';

import { GlassCard } from '../components/ui/GlassCard';
import { clsx } from 'clsx';

const Badge = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={clsx("px-2 py-0.5 rounded text-xs font-medium border", className)}>
        {children}
    </span>
);

const InfoItem = ({ icon: Icon, label, value }: { icon: any, label: string, value: string }) => (
    <div className="flex items-center space-x-3 p-3 rounded-lg bg-white/5 border border-white/5">
        <div className="p-2 bg-slate-800 rounded-lg">
            <Icon className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
            <div className="text-sm font-medium text-slate-200 truncate max-w-[150px] md:max-w-xs" title={value}>{value || '-'}</div>
        </div>
    </div>
);

export const NetworkDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { currentHost } = useHost();
    const [network, setNetwork] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNetwork = async () => {
            if (!id || !currentHost) return;
            try {
                // Unified API: Always use agent endpoint
                const endpoint = `/agents/${currentHost.id}/networks`;
                const { data } = await api.get(endpoint);
                const found = data.find((n: any) => n.ID === id || n.id === id || n.Name === id || n.name === id);
                
                if (found) {
                     setNetwork(found);
                } else {
                    toast.error("Network not found");
                    navigate('/networks');
                }
            } catch (error) {
                console.error("Failed to fetch network details", error);
                toast.error("Failed to load network details");
                navigate('/networks');
            } finally {
                setLoading(false);
            }
        };
        fetchNetwork();
    }, [id, navigate, currentHost]);

    const handleRemove = async () => {
        if (!confirm('Are you sure you want to remove this network?')) return;
        if (!currentHost) return;
        try {
            await api.delete(`/agents/${currentHost.id}/networks/${id}`);
            toast.success("Network removed successfully");
            navigate('/networks');
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Failed to remove network");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full text-slate-500 animate-pulse">
                Loading network details...
            </div>
        );
    }

    if (!network) return null;

    const shortId = network.Id.substring(0, 12);
    const createdDate = network.Created ? new Date(network.Created).toLocaleString() : 'N/A';
    
    // Parse connected containers
    const containers = network.Containers ? Object.values(network.Containers) : [];

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20">
            {/* Navigation & Actions */}
            <div className="flex items-center justify-between">
                <button 
                    onClick={() => navigate('/networks')}
                    className="flex items-center text-slate-400 hover:text-white transition-colors"
                >
                    <ArrowLeftIcon className="w-5 h-5 mr-2" />
                    Back to Networks
                </button>
                <div className="flex items-center space-x-3">
                     <span className="text-xs text-slate-500 font-mono">{network.Id}</span>
                     <button 
                        onClick={handleRemove}
                        className="flex items-center space-x-2 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-rose-500/20"
                    >
                        <TrashIcon className="w-4 h-4" />
                        <span>Remove</span>
                    </button>
                </div>
            </div>

            {/* Header Card */}
            <div className="relative overflow-hidden rounded-2xl bg-[#0f172a] border border-white/10 p-8 shadow-2xl">
                 <div className="absolute top-0 right-0 p-32 bg-indigo-500/5 blur-3xl rounded-full pointer-events-none transform translate-x-1/2 -translate-y-1/2" />
                 
                 <div className="relative z-10">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                        <div>
                            <div className="flex items-center space-x-3 mb-2">
                                <SignalIcon className="w-10 h-10 text-indigo-500" />
                                <h1 className="text-3xl font-bold text-white tracking-tight break-all">
                                    {network.Name}
                                </h1>
                            </div>
                            <div className="flex items-center space-x-2 text-slate-400 font-mono text-sm ml-1">
                                <span>ID: {shortId}</span>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-2 mt-4 ml-1">
                                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">In Use ({containers.length})</Badge>
                                <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20">{network.Driver}</Badge>
                                <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">{network.Scope}</Badge>
                            </div>
                        </div>
                    </div>
                 </div>
            </div>

            {/* Info Grid */}
            <GlassCard className="p-6">
                 <div className="flex items-center space-x-2 mb-6">
                    <InformationCircleIcon className="w-5 h-5 text-indigo-500" />
                    <h3 className="text-lg font-medium text-white">Network Details</h3>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <InfoItem icon={HashtagIcon} label="Full ID" value={network.Id} />
                    <InfoItem icon={SignalIcon} label="Name" value={network.Name} />
                    <InfoItem icon={ServerIcon} label="Driver" value={network.Driver} />
                    <InfoItem icon={GlobeAltIcon} label="Scope" value={network.Scope} />
                    <InfoItem icon={ClockIcon} label="Created" value={createdDate} />
                    <InfoItem icon={ShieldCheckIcon} label="Internal" value={network.Internal ? 'Yes' : 'No'} />
                    <InfoItem icon={InformationCircleIcon} label="IPv6 Enabled" value={network.EnableIPv6 ? 'Yes' : 'No'} />
                    <InfoItem icon={InformationCircleIcon} label="Ingress" value={network.Ingress ? 'Yes' : 'No'} />
                    <InfoItem icon={InformationCircleIcon} label="Attachable" value={network.Attachable ? 'Yes' : 'No'} />
                 </div>
            </GlassCard>

             {/* Connected Containers */}
             <GlassCard className="p-6">
                <div className="flex items-center space-x-2 mb-6">
                    <ServerIcon className="w-5 h-5 text-purple-500" />
                    <h3 className="text-lg font-medium text-white">Connected Containers</h3>
                    <span className="text-xs bg-white/10 text-slate-300 px-2 py-0.5 rounded-full">{containers.length}</span>
                </div>
                
                {containers.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border border-white/5">
                        <table className="w-full text-left text-sm text-slate-500 dark:text-slate-400">
                            <thead className="bg-black/20 text-slate-200">
                                <tr>
                                    <th className="px-6 py-3 font-medium">Name</th>
                                    <th className="px-6 py-3 font-medium">IPv4 Address</th>
                                    <th className="px-6 py-3 font-medium">IPv6 Address</th>
                                    <th className="px-6 py-3 font-medium">Mac Address</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {containers.map((c: any) => (
                                    <tr key={c.Name} className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4 font-medium text-indigo-400">{c.Name}</td>
                                        <td className="px-6 py-4 font-mono">{c.IPv4Address || '-'}</td>
                                        <td className="px-6 py-4 font-mono">{c.IPv6Address || '-'}</td>
                                        <td className="px-6 py-4 font-mono">{c.MacAddress || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center py-10 text-slate-500 border border-white/5 rounded-lg bg-black/10">
                        No containers connected to this network.
                    </div>
                )}
            </GlassCard>
        </div>
    );
};
