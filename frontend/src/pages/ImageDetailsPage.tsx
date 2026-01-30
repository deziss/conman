import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { 
    CubeIcon, 
    ArrowLeftIcon, 
    TrashIcon, 
    ClockIcon, 
    HashtagIcon, 
    CommandLineIcon,
    ServerIcon,
    CpuChipIcon,
    TagIcon,
    InformationCircleIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import clsx from 'clsx';

// Reusable Glass Card Component
const GlassCard = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={clsx(
        "bg-white/70 dark:bg-white/5 backdrop-blur-lg border border-slate-200/50 dark:border-white/10 rounded-xl overflow-hidden shadow-xl",
        className
    )}>
        {children}
    </div>
);

// Info Item Component
const InfoItem = ({ icon: Icon, label, value, subValue }: { icon: any, label: string, value: string, subValue?: string }) => (
    <div className="flex items-start space-x-3 p-4 rounded-lg bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/5">
        <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500">
            <Icon className="w-5 h-5" />
        </div>
        <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5 truncate max-w-[200px]" title={value}>{value}</p>
            {subValue && <p className="text-xs text-slate-500 mt-1">{subValue}</p>}
        </div>
    </div>
);

// Badge Component
const Badge = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <span className={clsx(
        "px-2.5 py-0.5 rounded-full text-xs font-medium border",
        className || "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
    )}>
        {children}
    </span>
);

export const ImageDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [image, setImage] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchImage = async () => {
            if (!id) return;
            try {
                // We use InspectImage which returns types.ImageInspect
                const { data } = await api.get(`/docker/images/${encodeURIComponent(id)}`);
                setImage(data);
            } catch (error) {
                console.error("Failed to fetch image details", error);
                toast.error("Failed to load image details");
                navigate('/images');
            } finally {
                setLoading(false);
            }
        };
        fetchImage();
    }, [id, navigate]);

    const handleRemove = async () => {
        if (!confirm('Are you sure you want to remove this image? This cannot be undone.')) return;
        try {
            await api.delete(`/docker/images/${id}`);
            toast.success("Image removed successfully");
            navigate('/images');
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Failed to remove image");
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full text-slate-500 animate-pulse">
                Loading image details...
            </div>
        );
    }

    if (!image) return null;

    // Derived Data
    const repoTags = image.RepoTags || [];
    const primaryTag = repoTags.length > 0 ? repoTags[0] : '<none>:<none>';
    const shortId = image.Id.replace('sha256:', '').substring(0, 12);
    const createdDate = new Date(image.Created).toLocaleString();
    const envVars = image.Config?.Env || [];
    
    // Parse Repo/Tag from primary tag
    const [repo, tag] = primaryTag.includes(':') ? primaryTag.split(':') : [primaryTag, 'latest'];

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20">
            {/* Navigation & Actions */}
            <div className="flex items-center justify-between">
                <button 
                    onClick={() => navigate('/images')}
                    className="flex items-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                    <ArrowLeftIcon className="w-5 h-5 mr-2" />
                    Back to Images
                </button>
                <div className="flex items-center space-x-3">
                     <span className="text-xs text-slate-500 font-mono">{image.Id}</span>
                     <button 
                        onClick={handleRemove}
                        className="flex items-center space-x-2 bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-500 hover:bg-rose-500 hover:text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-rose-200 dark:border-rose-500/20"
                    >
                        <TrashIcon className="w-4 h-4" />
                        <span>Remove</span>
                    </button>
                </div>
            </div>

            {/* Header Card */}
            <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 p-8 shadow-2xl">
                 <div className="absolute top-0 right-0 p-32 bg-amber-500/5 blur-3xl rounded-full pointer-events-none transform translate-x-1/2 -translate-y-1/2" />
                 
                 <div className="relative z-10">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                        <div>
                            <div className="flex items-center space-x-3 mb-2">
                                <CubeIcon className="w-10 h-10 text-amber-600 dark:text-amber-500" />
                                <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight break-all">
                                    {repo}
                                </h1>
                            </div>
                            <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400 font-mono text-sm ml-1">
                                <span>{tag}</span>
                                <span className="text-slate-400 dark:text-slate-600">•</span>
                                <span>{shortId}</span>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-2 mt-4 ml-1">
                                <Badge className="bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20">{image.Architecture}</Badge>
                                <Badge className="bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/20">{image.Os}</Badge>
                                <Badge className="bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20">{formatSize(image.Size)}</Badge>
                            </div>
                        </div>
                    </div>
                 </div>
            </div>

            {/* Info Grid */}
            <GlassCard className="p-6">
                 <div className="flex items-center space-x-2 mb-6">
                    <InformationCircleIcon className="w-5 h-5 text-amber-600 dark:text-amber-500" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white">Image Details</h3>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <InfoItem icon={HashtagIcon} label="Full ID" value={image.Id.replace('sha256:', '')} />
                    <InfoItem icon={ServerIcon} label="Size" value={formatSize(image.Size)} subValue={`${image.Size.toLocaleString()} bytes`} />
                    <InfoItem icon={ClockIcon} label="Created" value={createdDate} />
                    <InfoItem icon={CpuChipIcon} label="Architecture" value={image.Architecture} />
                    <InfoItem icon={CommandLineIcon} label="OS" value={image.Os} />
                    <InfoItem icon={InformationCircleIcon} label="Docker Version" value={image.DockerVersion || 'N/A'} />
                 </div>
            </GlassCard>

             {/* Tags Section */}
             {repoTags.length > 0 && (
                <GlassCard className="p-6">
                    <div className="flex items-center space-x-2 mb-6">
                        <TagIcon className="w-5 h-5 text-purple-600 dark:text-purple-500" />
                        <h3 className="text-lg font-medium text-slate-900 dark:text-white">Tags</h3>
                        <span className="text-xs bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">{repoTags.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {repoTags.map((t: string) => (
                            <span key={t} className="px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 font-mono text-sm">
                                {t}
                            </span>
                        ))}
                    </div>
                </GlassCard>
            )}

            {/* Config / Working Dir */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard className="p-6">
                     <div className="flex items-center space-x-2 mb-6">
                        <CommandLineIcon className="w-5 h-5 text-blue-600 dark:text-blue-500" />
                        <h3 className="text-lg font-medium text-slate-900 dark:text-white">Container Config</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between p-3 rounded bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/5">
                            <span className="text-slate-500 dark:text-slate-400 text-sm">Working Dir</span>
                            <span className="text-slate-800 dark:text-slate-200 font-mono text-sm">{image.Config?.WorkingDir || '/'}</span>
                        </div>
                        <div className="flex justify-between p-3 rounded bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/5">
                            <span className="text-slate-500 dark:text-slate-400 text-sm">User</span>
                            <span className="text-slate-800 dark:text-slate-200 font-mono text-sm">{image.Config?.User || 'root (default)'}</span>
                        </div>
                         <div className="flex justify-between p-3 rounded bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/5">
                            <span className="text-slate-500 dark:text-slate-400 text-sm">Entrypoint</span>
                            <span className="text-slate-800 dark:text-slate-200 font-mono text-sm truncate max-w-[200px]" title={String(image.Config?.Entrypoint)}>
                                {image.Config?.Entrypoint ? JSON.stringify(image.Config.Entrypoint) : 'null'}
                            </span>
                        </div>
                         <div className="flex justify-between p-3 rounded bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/5">
                            <span className="text-slate-500 dark:text-slate-400 text-sm">Cmd</span>
                            <span className="text-slate-800 dark:text-slate-200 font-mono text-sm truncate max-w-[200px]" title={String(image.Config?.Cmd)}>
                                {image.Config?.Cmd ? JSON.stringify(image.Config.Cmd) : 'null'}
                            </span>
                        </div>
                    </div>
                </GlassCard>

                 {/* Exposed Ports */}
                 <GlassCard className="p-6">
                     <div className="flex items-center space-x-2 mb-6">
                        <ServerIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
                        <h3 className="text-lg font-medium text-slate-900 dark:text-white">Exposed Ports</h3>
                    </div>
                    {image.Config?.ExposedPorts ? (
                        <div className="flex flex-wrap gap-2">
                             {Object.keys(image.Config.ExposedPorts).map(port => (
                                <Badge key={port} className="bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20 px-3 py-1">
                                    {port}
                                </Badge>
                             ))}
                        </div>
                    ) : (
                        <p className="text-slate-500 text-sm italic">No exposed ports defined.</p>
                    )}
                </GlassCard>
            </div>

            {/* Environment Variables */}
            <GlassCard className="p-6">
                <div className="flex items-center space-x-2 mb-6">
                    <CubeIcon className="w-5 h-5 text-pink-600 dark:text-pink-500" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white">Environment Variables</h3>
                </div>
                {envVars.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {envVars.map((env: string, i: number) => {
                            const [key, ...rest] = env.split('=');
                            const val = rest.join('=');
                            return (
                                <div key={i} className="flex flex-col p-3 rounded bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/5 overflow-hidden">
                                    <span className="text-xs text-slate-500 font-mono mb-1">{key}</span>
                                    <span className="text-sm text-slate-700 dark:text-slate-300 font-mono truncate" title={val}>{val}</span>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-slate-500 text-sm italic">No environment variables defined.</p>
                )}
            </GlassCard>
        </div>
    );
};
