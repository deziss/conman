import { isConmanSystemImage } from '../utils/systemProtection';
import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useHost } from '../contexts/HostContext';
import { useSettings } from '../contexts/SettingsContext';
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
    InformationCircleIcon,
    ShieldCheckIcon,
    ShieldExclamationIcon,
    ExclamationTriangleIcon,
    ArrowPathIcon,
    MagnifyingGlassIcon,
    ArrowTopRightOnSquareIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    CheckCircleIcon,
    FunnelIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { ConfirmModal } from '../components/ui/ConfirmModal';

interface VulnerabilityItem {
    id?: string;
    vulnerability_id?: string;
    package?: string;
    pkg_name?: string;
    installed_version: string;
    fixed_version: string;
    severity: string;
    title: string;
    description: string;
    primary_url: string;
    score?: number;
}

interface VulnerabilityReport {
    id: number;
    created_at: string;
    updated_at: string;
    image_id: string;
    image_tag: string;
    scan_status: string;
    scanner: string;
    critical_count: number;
    high_count: number;
    medium_count: number;
    low_count: number;
    total_count: number;
    vulnerabilities: VulnerabilityItem[];
    error_message?: string;
}

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
        <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5 truncate" title={value}>{value}</p>
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
    const { currentHost } = useHost();
    const { trivySecurityEnabled, trivySeverityThreshold, updateSettings } = useSettings();
    const [image, setImage] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);

    // Security Scanner State
    const [scanReport, setScanReport] = useState<VulnerabilityReport | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [loadingReport, setLoadingReport] = useState(false);
    const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>(
        () => trivySeverityThreshold || 'ALL'
    );
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedCves, setExpandedCves] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const fetchImage = async () => {
            if (!id) return;
            setLoading(true);
            setFetchError(null);
            try {
                let res;
                try {
                    if (currentHost?.id) {
                        res = await api.get(`/agents/${currentHost.id}/images/${encodeURIComponent(id)}`);
                    } else {
                        res = await api.get(`/docker/images/${encodeURIComponent(id)}`);
                    }
                } catch (err: any) {
                    res = await api.get(`/docker/images/${encodeURIComponent(id)}`);
                }
                setImage(res.data);

                // Check for existing vulnerability report only if Trivy scanning is enabled
                if (trivySecurityEnabled) {
                    const primaryTag = res.data.RepoTags && res.data.RepoTags.length > 0 ? res.data.RepoTags[0] : '';
                    fetchVulnerabilityReport(id, primaryTag);
                }
            } catch (error: any) {
                console.error("Failed to fetch image details", error);
                const msg = error.response?.data?.error || error.message || "Failed to load image details";
                setFetchError(msg);
                toast.error(`Failed to load image details: ${msg}`);
            } finally {
                setLoading(false);
            }
        };
        fetchImage();
    }, [id, currentHost, trivySecurityEnabled]);

    const fetchVulnerabilityReport = async (imageId: string, imageTag?: string) => {
        setLoadingReport(true);
        try {
            let res;
            try {
                if (currentHost?.id) {
                    res = await api.get(`/agents/${currentHost.id}/images/${encodeURIComponent(imageId)}/vulnerabilities`, {
                        params: imageTag ? { image: imageTag } : undefined
                    });
                } else {
                    res = await api.get(`/docker/images/${encodeURIComponent(imageId)}/vulnerabilities`, {
                        params: imageTag ? { image: imageTag } : undefined
                    });
                }
            } catch (err) {
                res = await api.get(`/docker/images/${encodeURIComponent(imageId)}/vulnerabilities`, {
                    params: imageTag ? { image: imageTag } : undefined
                });
            }
            setScanReport(res.data);
        } catch (error: any) {
            // If 404, simply no scan has been run yet
            if (error.response?.status !== 404) {
                console.warn("Failed to check vulnerability report:", error);
            }
        } finally {
            setLoadingReport(false);
        }
    };

    const handleTriggerScan = async (force = false) => {
        if (!image || !id) return;
        if (!trivySecurityEnabled) {
            updateSettings({ trivySecurityEnabled: true });
            toast.success("Enabled Trivy Security Scanner in Settings");
        }
        setIsScanning(true);
        const primaryTag = image.RepoTags && image.RepoTags.length > 0 ? image.RepoTags[0] : id;
        
        try {
            const url = currentHost?.id 
                ? `/agents/${currentHost.id}/images/${encodeURIComponent(id)}/scan`
                : `/docker/images/${encodeURIComponent(id)}/scan`;
            
            let data;
            try {
                const res = await api.post(url, null, {
                    params: { image: primaryTag, force: force ? 'true' : 'false' },
                    timeout: 120000 // Trivy scan can take a bit on first run
                });
                data = res.data;
            } catch (e) {
                const res = await api.post(`/docker/images/${encodeURIComponent(id)}/scan`, null, {
                    params: { image: primaryTag, force: force ? 'true' : 'false' },
                    timeout: 120000
                });
                data = res.data;
            }
            setScanReport(data);
            if (data.total_count === 0) {
                toast.success("Security scan clean! Zero vulnerabilities found.");
            } else {
                toast.success(`Scan complete: ${data.total_count} vulnerabilities detected (${data.critical_count} critical)`);
            }
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message || "Scan failed";
            toast.error(`Security scan failed: ${msg}`);
        } finally {
            setIsScanning(false);
        }
    };

    const toggleCveExpansion = (cveId: string) => {
        setExpandedCves(prev => ({ ...prev, [cveId]: !prev[cveId] }));
    };

    const handleRemove = () => {
        setShowConfirm(true);
    };

    const executeRemove = async () => {
        if (!id) return;
        try {
            if (currentHost?.id) {
                await api.delete(`/agents/${currentHost.id}/images/${encodeURIComponent(id)}`);
            } else {
                await api.delete(`/docker/images/${encodeURIComponent(id)}`);
            }
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

    // Filtered vulnerabilities
    const filteredVulnerabilities = useMemo(() => {
        if (!scanReport?.vulnerabilities) return [];
        return scanReport.vulnerabilities.filter(vuln => {
            if (severityFilter !== 'ALL' && vuln.severity.toUpperCase() !== severityFilter) {
                return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const cveId = vuln.vulnerability_id || vuln.id || '';
                const pkgName = vuln.pkg_name || vuln.package || '';
                const matchId = cveId.toLowerCase().includes(q);
                const matchPkg = pkgName.toLowerCase().includes(q);
                const matchTitle = (vuln.title || '').toLowerCase().includes(q);
                if (!matchId && !matchPkg && !matchTitle) return false;
            }
            return true;
        });
    }, [scanReport, severityFilter, searchQuery]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[350px] text-slate-400 gap-3">
                <div className="w-8 h-8 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
                <span className="text-sm animate-pulse">Loading image specifications and security profile...</span>
            </div>
        );
    }

    if (fetchError && !image) {
        return (
            <div className="p-8 max-w-xl mx-auto text-center space-y-4 my-12">
                <div className="p-4 rounded-2xl bg-rose-500/10 text-rose-500 w-16 h-16 mx-auto flex items-center justify-center ring-1 ring-rose-500/20">
                    <ExclamationTriangleIcon className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Failed to Load Image Details</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{fetchError}</p>
                <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                        onClick={() => navigate('/images')}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors"
                    >
                        Back to Images
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-medium shadow-md shadow-cyan-500/20 transition-all"
                    >
                        Retry Request
                    </button>
                </div>
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
    const [repo, tag] = primaryTag.includes(':') ? primaryTag.split(':') : [primaryTag, 'latest'];

    const getSeverityBadgeClass = (severity: string) => {
        switch (severity.toUpperCase()) {
            case 'CRITICAL':
                return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
            case 'HIGH':
                return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30';
            case 'MEDIUM':
                return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
            case 'LOW':
                return 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30';
            default:
                return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30';
        }
    };

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
                     <span className="text-xs text-slate-500 font-mono">{image.Id.substring(0, 19)}...</span>
                     <button
                        onClick={() => handleTriggerScan(true)}
                        disabled={isScanning}
                        className={clsx(
                            "flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all shadow-sm border",
                            isScanning
                                ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 cursor-wait"
                                : "bg-cyan-600 hover:bg-cyan-500 text-white border-cyan-500/30 hover:shadow-cyan-500/20"
                        )}
                     >
                        <ArrowPathIcon className={clsx("w-4 h-4", isScanning && "animate-spin")} />
                        <span>{isScanning ? "Scanning Trivy..." : scanReport ? "Re-scan Security" : "Scan Vulnerabilities"}</span>
                     </button>
                     <button 
                        onClick={handleRemove}
                        disabled={isConmanSystemImage(image.RepoTags, image.Id)}
                        className={clsx(
                            "flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                            isConmanSystemImage(image.RepoTags, image.Id)
                                ? "bg-slate-100 dark:bg-white/5 text-slate-400 border-slate-200 dark:border-white/5 cursor-not-allowed"
                                : "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20 hover:bg-rose-100 dark:hover:bg-rose-500/20"
                        )}
                        title={isConmanSystemImage(image.RepoTags, image.Id) ? "Protected system image" : "Remove Image"}
                     >
                        <TrashIcon className="w-4 h-4" />
                        <span>Remove</span>
                     </button>
                </div>
            </div>

            {/* Hero Header */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-rose-500/10 p-8 border border-amber-500/20 dark:border-amber-500/10 backdrop-blur-xl">
                 <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                    <div className="flex items-center space-x-5">
                        <div className="p-4 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30">
                            <CubeIcon className="w-10 h-10" />
                        </div>
                        <div>
                            <div className="flex items-center space-x-3">
                                <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
                                    {repo}
                                </h1>
                                <Badge className="bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20">
                                    {tag}
                                </Badge>
                                {scanReport && (
                                    <Badge className={clsx(
                                        scanReport.critical_count > 0 
                                            ? "bg-rose-500/10 text-rose-500 border-rose-500/30"
                                            : scanReport.high_count > 0
                                                ? "bg-orange-500/10 text-orange-500 border-orange-500/30"
                                                : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                                    )}>
                                        {scanReport.critical_count > 0 
                                            ? `${scanReport.critical_count} Critical CVEs`
                                            : scanReport.total_count > 0 
                                                ? `${scanReport.total_count} CVEs`
                                                : "Zero CVEs"}
                                    </Badge>
                                )}
                            </div>
                            <div className="flex items-center space-x-4 mt-2 text-sm text-slate-500 dark:text-slate-400">
                                <span>ID: <code className="text-slate-700 dark:text-slate-300">{shortId}</code></span>
                                <span>•</span>
                                <span>Size: {formatSize(image.Size)}</span>
                                <span>•</span>
                                <span>Created: {createdDate}</span>
                            </div>
                        </div>
                    </div>
                 </div>
            </div>

            {/* VULNERABILITY SECURITY SCANNER CARD */}
            <GlassCard className="p-6 border-cyan-500/20 dark:border-cyan-500/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-white/10">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500 dark:text-cyan-400">
                            <ShieldCheckIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center space-x-2">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Security Vulnerability Scan</h3>
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                                    Trivy Core
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Automated CVE vulnerability discovery across OS packages and application dependencies
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center space-x-3">
                        {scanReport && (
                            <div className="text-right mr-2 hidden sm:block">
                                <p className="text-[11px] text-slate-400 uppercase tracking-wider">Last Scanned</p>
                                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                    {new Date(scanReport.updated_at).toLocaleString()}
                                </p>
                            </div>
                        )}
                        <button
                            onClick={() => handleTriggerScan(true)}
                            disabled={isScanning}
                            className={clsx(
                                "flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all shadow-sm border",
                                isScanning
                                    ? "bg-slate-100 dark:bg-white/5 text-slate-400 border-slate-200 dark:border-white/10 cursor-wait"
                                    : "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-transparent hover:shadow-cyan-500/25"
                            )}
                        >
                            <ArrowPathIcon className={clsx("w-4 h-4", isScanning && "animate-spin")} />
                            <span>{isScanning ? "Scanning with Trivy..." : scanReport ? "Run Re-Scan" : "Scan Image Now"}</span>
                        </button>
                    </div>
                </div>

                {/* Body State: Scanning In Progress */}
                {isScanning && (
                    <div className="py-12 flex flex-col items-center justify-center text-center">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-full border-4 border-cyan-500/20 border-t-cyan-500 animate-spin" />
                            <ShieldCheckIcon className="w-8 h-8 text-cyan-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        </div>
                        <h4 className="text-base font-medium text-slate-800 dark:text-slate-200 mt-4">Analyzing Image Layers & CVE Signatures</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">
                            Running Trivy scanner against container filesystem and matching installed binaries with the Aqua Security vulnerability database.
                        </p>
                    </div>
                )}

                {/* Body State: Trivy Disabled in Settings */}
                {!isScanning && !trivySecurityEnabled && (
                    <div className="py-10 flex flex-col items-center justify-center text-center px-4">
                        <div className="p-4 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-400 mb-4 ring-1 ring-slate-200 dark:ring-white/10">
                            <ShieldCheckIcon className="w-10 h-10 text-slate-400" />
                        </div>
                        <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200">Trivy Security Scanning is Disabled</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-lg mb-6 leading-relaxed">
                            Image vulnerability analysis is turned off by default to minimize host memory and network overhead. You can enable it in Settings or activate it now to inspect CVEs for this image.
                        </p>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => handleTriggerScan(false)}
                                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white transition-all shadow-lg shadow-cyan-500/20"
                            >
                                <ShieldCheckIcon className="w-4 h-4" />
                                <span>Enable & Run Scan</span>
                            </button>
                            <button
                                onClick={() => navigate('/settings')}
                                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200 dark:border-white/10"
                            >
                                Configure in Settings
                            </button>
                        </div>
                    </div>
                )}

                {/* Body State: No Scan Report Yet (When enabled) */}
                {!isScanning && trivySecurityEnabled && !scanReport && !loadingReport && (
                    <div className="py-10 flex flex-col items-center justify-center text-center">
                        <div className="p-4 rounded-full bg-slate-100 dark:bg-white/5 text-slate-400 mb-4">
                            <ShieldExclamationIcon className="w-10 h-10" />
                        </div>
                        <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200">No Security Scan Found</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mb-6">
                            This image hasn't been scanned for security vulnerabilities yet. Trigger a Trivy scan to audit CVEs, package versions, and security advisories.
                        </p>
                        <button
                            onClick={() => handleTriggerScan(false)}
                            className="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-all shadow-md hover:shadow-cyan-500/25"
                        >
                            <ShieldCheckIcon className="w-5 h-5" />
                            <span>Run Initial Security Scan</span>
                        </button>
                    </div>
                )}

                {/* Body State: Report Loaded */}
                {!isScanning && scanReport && (
                    <div className="space-y-6 pt-6">
                        {/* Summary Metrics Bar */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            <div 
                                onClick={() => setSeverityFilter('CRITICAL')}
                                className={clsx(
                                    "p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between",
                                    severityFilter === 'CRITICAL' 
                                        ? "bg-rose-500/15 border-rose-500 shadow-md shadow-rose-500/10" 
                                        : "bg-slate-100/50 dark:bg-black/20 border-slate-200 dark:border-white/5 hover:border-rose-500/50"
                                )}
                            >
                                <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Critical</span>
                                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-2">{scanReport.critical_count}</span>
                            </div>

                            <div 
                                onClick={() => setSeverityFilter('HIGH')}
                                className={clsx(
                                    "p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between",
                                    severityFilter === 'HIGH' 
                                        ? "bg-orange-500/15 border-orange-500 shadow-md shadow-orange-500/10" 
                                        : "bg-slate-100/50 dark:bg-black/20 border-slate-200 dark:border-white/5 hover:border-orange-500/50"
                                )}
                            >
                                <span className="text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">High</span>
                                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-2">{scanReport.high_count}</span>
                            </div>

                            <div 
                                onClick={() => setSeverityFilter('MEDIUM')}
                                className={clsx(
                                    "p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between",
                                    severityFilter === 'MEDIUM' 
                                        ? "bg-amber-500/15 border-amber-500 shadow-md shadow-amber-500/10" 
                                        : "bg-slate-100/50 dark:bg-black/20 border-slate-200 dark:border-white/5 hover:border-amber-500/50"
                                )}
                            >
                                <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Medium</span>
                                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-2">{scanReport.medium_count}</span>
                            </div>

                            <div 
                                onClick={() => setSeverityFilter('LOW')}
                                className={clsx(
                                    "p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between",
                                    severityFilter === 'LOW' 
                                        ? "bg-sky-500/15 border-sky-500 shadow-md shadow-sky-500/10" 
                                        : "bg-slate-100/50 dark:bg-black/20 border-slate-200 dark:border-white/5 hover:border-sky-500/50"
                                )}
                            >
                                <span className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">Low</span>
                                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-2">{scanReport.low_count}</span>
                            </div>

                            <div 
                                onClick={() => setSeverityFilter('ALL')}
                                className={clsx(
                                    "p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between col-span-2 sm:col-span-1",
                                    severityFilter === 'ALL' 
                                        ? "bg-indigo-500/15 border-indigo-500 shadow-md shadow-indigo-500/10" 
                                        : "bg-slate-100/50 dark:bg-black/20 border-slate-200 dark:border-white/5 hover:border-indigo-500/50"
                                )}
                            >
                                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Total CVEs</span>
                                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-2">{scanReport.total_count}</span>
                            </div>
                        </div>

                        {/* Search and Filters */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                            <div className="relative flex-1">
                                <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Search CVE ID, package name, or vulnerability title..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 text-sm rounded-lg bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                />
                            </div>

                            <div className="flex items-center space-x-2">
                                <FunnelIcon className="w-4 h-4 text-slate-400" />
                                <span className="text-xs text-slate-500 dark:text-slate-400">Filter:</span>
                                <div className="flex flex-wrap gap-1">
                                    {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(sev => (
                                        <button
                                            key={sev}
                                            onClick={() => setSeverityFilter(sev)}
                                            className={clsx(
                                                "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                                                severityFilter === sev
                                                    ? "bg-cyan-600 text-white shadow-sm"
                                                    : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10"
                                            )}
                                        >
                                            {sev}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Zero Vulnerabilities Clean State */}
                        {scanReport.total_count === 0 && (
                            <div className="py-8 flex flex-col items-center justify-center text-center rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                                <CheckCircleIcon className="w-12 h-12 text-emerald-500 mb-2" />
                                <h4 className="text-base font-semibold text-slate-900 dark:text-white">Zero Vulnerabilities Detected</h4>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">
                                    Trivy inspected this container image and found no known CVEs. Image is clean and hardened.
                                </p>
                            </div>
                        )}

                        {/* Vulnerability Items List */}
                        {scanReport.total_count > 0 && filteredVulnerabilities.length === 0 && (
                            <div className="py-8 text-center text-sm text-slate-500 italic">
                                No vulnerabilities match your current filter and search query.
                            </div>
                        )}

                        {filteredVulnerabilities.length > 0 && (
                            <div className="space-y-3">
                                {filteredVulnerabilities.map((vuln) => {
                                    const cveId = vuln.vulnerability_id || vuln.id || '';
                                    const pkgName = vuln.pkg_name || vuln.package || '';
                                    const isExpanded = expandedCves[cveId];
                                    return (
                                        <div
                                            key={cveId + pkgName}
                                            className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 overflow-hidden transition-all hover:border-slate-300 dark:hover:border-white/20"
                                        >
                                            <div
                                                onClick={() => toggleCveExpansion(cveId)}
                                                className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 cursor-pointer select-none"
                                            >
                                                <div className="flex items-center space-x-3 min-w-0">
                                                    <span className={clsx(
                                                        "px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider border",
                                                        getSeverityBadgeClass(vuln.severity)
                                                    )}>
                                                        {vuln.severity}
                                                    </span>

                                                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                                                        {cveId}
                                                    </span>

                                                    <span className="text-sm text-slate-600 dark:text-slate-300 font-mono truncate">
                                                        <span className="font-semibold text-slate-900 dark:text-white">{pkgName}</span>
                                                        <span className="text-slate-400 ml-1.5 text-xs">v{vuln.installed_version}</span>
                                                    </span>
                                                </div>

                                                <div className="flex items-center space-x-4 ml-auto md:ml-0">
                                                    {vuln.fixed_version && (
                                                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                                            Fix: {vuln.fixed_version}
                                                        </span>
                                                    )}

                                                    {vuln.primary_url && (
                                                        <a
                                                            href={vuln.primary_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 transition-colors p-1"
                                                            title="Open CVE Advisory"
                                                        >
                                                            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                                        </a>
                                                    )}

                                                    <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                                        {isExpanded ? (
                                                            <ChevronUpIcon className="w-4 h-4" />
                                                        ) : (
                                                            <ChevronDownIcon className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Expandable Advisory & Description */}
                                            {isExpanded && (
                                                <div className="px-4 pb-4 pt-2 border-t border-slate-200/50 dark:border-white/5 space-y-2 bg-white/40 dark:bg-white/[0.02]">
                                                    {vuln.title && (
                                                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                                            {vuln.title}
                                                        </p>
                                                    )}
                                                    {vuln.description && (
                                                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                                            {vuln.description}
                                                        </p>
                                                    )}
                                                    {vuln.primary_url && (
                                                        <div className="pt-1">
                                                            <a
                                                                href={vuln.primary_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center text-xs text-cyan-600 dark:text-cyan-400 hover:underline font-mono"
                                                            >
                                                                <span>{vuln.primary_url}</span>
                                                                <ArrowTopRightOnSquareIcon className="w-3 h-3 ml-1" />
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </GlassCard>

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

            <ConfirmModal
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                onConfirm={executeRemove}
                title="Remove Image"
                message="Are you sure? This image will be permanently deleted."
                confirmText="Remove"
                isDestructive
            />
        </div>
    );
};
