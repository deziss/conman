import React, { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { 
    XMarkIcon, 
    CheckIcon, 
    SparklesIcon, 
    KeyIcon, 
    ArrowTopRightOnSquareIcon,
    ArrowPathIcon,
    ShieldCheckIcon,
    ServerStackIcon,
} from '@heroicons/react/24/outline';
import { useLicense } from '../../contexts/LicenseContext';
import { toast } from 'react-hot-toast';

interface SubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: 'plans' | 'activate' | 'compare';
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ 
    isOpen, 
    onClose,
    initialTab = 'plans'
}) => {
    const { license, activateLicense } = useLicense();
    const currentTier = license?.tier || 'community';

    const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>('annually');
    const [activeTab, setActiveTab] = useState<'plans' | 'compare' | 'activate'>(initialTab);
    const [licenseKeyInput, setLicenseKeyInput] = useState('');
    const [activating, setActivating] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
        }
    }, [isOpen, initialTab]);

    const handleActivateKey = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = licenseKeyInput.trim();
        if (!trimmed) {
            toast.error('Please enter a valid license key');
            return;
        }

        setActivating(true);
        try {
            await activateLicense(trimmed);
            toast.success('License activated successfully via Licencia!');
            setLicenseKeyInput('');
            onClose();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to activate license key');
        } finally {
            setActivating(false);
        }
    };

    const handleBuyClick = (planSlug: string) => {
        const url = `https://licencia.deziss.com/checkout/conman?plan=${planSlug}&cycle=${billingCycle}`;
        window.open(url, '_blank', 'noopener,noreferrer');
        toast('Redirecting to secure Licencia checkout...', { icon: '💳' });
    };

    const plans = [
        {
            slug: 'community',
            name: 'Community',
            badge: 'Open Source',
            tier: 'community',
            description: 'Free forever for local developers, homelabs, and single-instance deployments.',
            monthlyPrice: 0,
            annualPrice: 0,
            hostsText: '1 Host Node (Local)',
            popular: false,
            highlight: false,
            features: [
                '1 Host Node (Local Docker Daemon)',
                'Realtime Container & Resource Monitoring',
                'Interactive Web Terminal & Live Logs',
                'Aqua Security Trivy Vulnerability Scanner',
                'Standard Webhook & Com0 Basic Alerts',
                'Community Forums & Discord Support'
            ],
            buttonText: currentTier === 'community' ? 'Active Plan' : 'Free Forever',
            disabled: currentTier === 'community'
        },
        {
            slug: 'pro',
            name: 'Pro',
            badge: 'Most Popular',
            tier: 'pro',
            description: 'For growing teams, staging environments, and multi-server production nodes.',
            monthlyPrice: 19,
            annualPrice: 190, // ~$15.8/mo
            hostsText: 'Up to 10 Host Nodes',
            popular: true,
            highlight: true,
            features: [
                'Up to 10 Remote Host Nodes & Agents (mTLS)',
                'Docker Compose Stack Orchestration & YAML Editor',
                'Automated Image Vulnerability & Update Checks',
                'Multi-channel Com0 Alerts (WhatsApp, SMS, Push)',
                'Container Health Auto-Restart Policies',
                'Priority Email & Community Support',
                'Instant Key Delivery via Licencia'
            ],
            buttonText: currentTier === 'pro' ? 'Active Plan' : 'Upgrade to Pro',
            disabled: currentTier === 'pro'
        },
        {
            slug: 'enterprise',
            name: 'Enterprise',
            badge: 'Full Fleet Control',
            tier: 'enterprise',
            description: 'For organizations demanding unbounded scalability, compliance, and custom SLAs.',
            monthlyPrice: 79,
            annualPrice: 790, // ~$65.8/mo
            hostsText: 'Unlimited Host Nodes',
            popular: false,
            highlight: false,
            features: [
                'Unlimited Remote Host Agents & Clusters',
                'Granular Role-Based Access Control (RBAC)',
                'Enterprise SSO (Keycloak, OIDC, SAML, Google)',
                'Tamper-Evident Security Audit Logs & Compliance',
                'Air-Gapped & Offline Licencia Key Provisioning',
                '24/7 Dedicated SLA & Architecture Support',
                'Custom Billing via Invoice & Purchase Order'
            ],
            buttonText: currentTier === 'enterprise' ? 'Active Plan' : 'Upgrade to Enterprise',
            disabled: currentTier === 'enterprise'
        }
    ];

    const comparisonFeatures = [
        { name: 'Host Capacity', community: '1 Node (Local)', pro: 'Up to 10 Nodes', enterprise: 'Unlimited Nodes' },
        { name: 'Docker Compose Stacks', community: false, pro: true, enterprise: true },
        { name: 'Remote Agents (mTLS)', community: false, pro: true, enterprise: true },
        { name: 'Trivy Vulnerability Scanner', community: true, pro: true, enterprise: true },
        { name: 'Alerts & Webhooks', community: true, pro: true, enterprise: true },
        { name: 'Com0 Universal Comms (WhatsApp/SMS)', community: 'Standard', pro: 'Priority Multi-channel', enterprise: 'High-Throughput Dedicated' },
        { name: 'Automated Image Update Checking', community: false, pro: true, enterprise: true },
        { name: 'Team RBAC & Access Permissions', community: false, pro: false, enterprise: true },
        { name: 'Enterprise SSO (Keycloak/SAML/OIDC)', community: false, pro: false, enterprise: true },
        { name: 'Audit Logging & Compliance Export', community: false, pro: false, enterprise: true },
        { name: 'Support Level', community: 'Community Forum', pro: 'Priority Email', enterprise: '24/7 SLA + Slack/Teams' },
    ];

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-200"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-150"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-200"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-150"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-5xl transform overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-6 sm:p-8 text-left align-middle shadow-2xl transition-all">
                                {/* Header */}
                                <div className="flex items-start justify-between pb-6 border-b border-slate-100 dark:border-white/5">
                                    <div>
                                        <div className="flex items-center gap-2.5">
                                            <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow-md shadow-cyan-500/20">
                                                <SparklesIcon className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <Dialog.Title as="h3" className="text-xl font-bold text-slate-900 dark:text-white">
                                                    Conman Subscription & Licencia Plans
                                                </Dialog.Title>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                    Unlock multi-host fleet orchestration, Docker Compose stacks, and enterprise security.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={onClose}
                                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        <XMarkIcon className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Tabs & Billing Cycle Controls */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6">
                                    {/* Navigation Tabs */}
                                    <div className="flex bg-slate-100 dark:bg-slate-800/70 p-1 rounded-xl border border-slate-200 dark:border-white/5 self-start">
                                        <button
                                            onClick={() => setActiveTab('plans')}
                                            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                                activeTab === 'plans'
                                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                            }`}
                                        >
                                            Tiers & Pricing
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('compare')}
                                            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                                activeTab === 'compare'
                                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                            }`}
                                        >
                                            Feature Comparison
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('activate')}
                                            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                                activeTab === 'activate'
                                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                            }`}
                                        >
                                            <KeyIcon className="w-3.5 h-3.5" />
                                            <span>Activate Key</span>
                                        </button>
                                    </div>

                                    {/* Monthly / Annual Toggle (Only visible in 'plans' tab) */}
                                    {activeTab === 'plans' && (
                                        <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                                            <span className={billingCycle === 'monthly' ? 'font-bold text-slate-900 dark:text-white' : ''}>
                                                Monthly
                                            </span>
                                            <button
                                                onClick={() => setBillingCycle(prev => prev === 'monthly' ? 'annually' : 'monthly')}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                                                    billingCycle === 'annually' ? 'bg-cyan-600' : 'bg-slate-300 dark:bg-slate-700'
                                                }`}
                                            >
                                                <span
                                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                        billingCycle === 'annually' ? 'translate-x-6' : 'translate-x-1'
                                                    }`}
                                                />
                                            </button>
                                            <span className={`flex items-center gap-1 ${billingCycle === 'annually' ? 'font-bold text-slate-900 dark:text-white' : ''}`}>
                                                <span>Annual Billing</span>
                                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                    Save 20%
                                                </span>
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* TAB 1: Plan Cards */}
                                {activeTab === 'plans' && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                                        {plans.map((p) => {
                                            const isCurrent = currentTier === p.tier;
                                            const price = billingCycle === 'annually' 
                                                ? (p.annualPrice > 0 ? Math.round(p.annualPrice / 12) : 0)
                                                : p.monthlyPrice;

                                            return (
                                                <div
                                                    key={p.slug}
                                                    className={`relative flex flex-col justify-between rounded-2xl p-6 transition-all duration-200 ${
                                                        p.highlight
                                                            ? 'bg-gradient-to-b from-cyan-500/[0.08] to-indigo-500/[0.04] dark:from-cyan-500/[0.12] dark:to-indigo-500/[0.05] border-2 border-cyan-500 shadow-xl shadow-cyan-500/10'
                                                            : 'bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5'
                                                    }`}
                                                >
                                                    {/* Top Badges */}
                                                    <div className="flex items-center justify-between mb-4">
                                                        <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                                                            p.highlight 
                                                                ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 border-cyan-500/30'
                                                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600'
                                                        }`}>
                                                            {p.badge}
                                                        </span>
                                                        {isCurrent && (
                                                            <span className="text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                                                                Active Tier
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Title & Description */}
                                                    <div>
                                                        <h4 className="text-xl font-bold text-slate-900 dark:text-white">{p.name}</h4>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 min-h-[36px]">
                                                            {p.description}
                                                        </p>

                                                        {/* Price */}
                                                        <div className="mt-4 mb-2 flex items-baseline gap-1">
                                                            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                                                                ${price}
                                                            </span>
                                                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                                                {p.monthlyPrice === 0 ? 'forever' : '/ month'}
                                                            </span>
                                                        </div>
                                                        {billingCycle === 'annually' && p.annualPrice > 0 && (
                                                            <p className="text-[11px] text-cyan-600 dark:text-cyan-400 font-medium">
                                                                ${p.annualPrice} billed annually
                                                            </p>
                                                        )}

                                                        {/* Host Capacity Pill */}
                                                        <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                                                            <ServerStackIcon className="w-3.5 h-3.5 text-cyan-500" />
                                                            <span>{p.hostsText}</span>
                                                        </div>

                                                        {/* Feature Checklist */}
                                                        <div className="mt-6 space-y-2.5 border-t border-slate-200 dark:border-white/5 pt-4">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                                                Key Benefits:
                                                            </p>
                                                            {p.features.map((f, idx) => (
                                                                <div key={idx} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                                                                    <CheckIcon className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                                                    <span>{f}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Action Button */}
                                                    <div className="mt-8 pt-4 border-t border-slate-100 dark:border-white/5">
                                                        <button
                                                            onClick={() => handleBuyClick(p.slug)}
                                                            disabled={p.disabled}
                                                            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                                                p.disabled
                                                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-200 dark:border-white/5'
                                                                    : p.highlight
                                                                    ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white hover:from-cyan-400 hover:to-indigo-500 shadow-lg shadow-cyan-500/25'
                                                                    : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 shadow-md'
                                                            }`}
                                                        >
                                                            <span>{p.buttonText}</span>
                                                            {!p.disabled && <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* TAB 2: Feature Comparison Matrix */}
                                {activeTab === 'compare' && (
                                    <div className="mt-6 overflow-x-auto">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="border-b border-slate-200 dark:border-white/10 text-slate-400 uppercase text-[10px] tracking-wider">
                                                    <th className="py-3 px-4">Feature / Capability</th>
                                                    <th className="py-3 px-4 font-bold text-slate-700 dark:text-slate-300">Community</th>
                                                    <th className="py-3 px-4 font-bold text-cyan-600 dark:text-cyan-400">Pro Edition</th>
                                                    <th className="py-3 px-4 font-bold text-purple-600 dark:text-purple-400">Enterprise</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                                {comparisonFeatures.map((row, i) => (
                                                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                                                            {row.name}
                                                        </td>
                                                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                                                            {typeof row.community === 'boolean' ? (
                                                                row.community ? <CheckIcon className="w-4 h-4 text-emerald-500" /> : <span className="text-slate-300 dark:text-slate-600">—</span>
                                                            ) : (
                                                                row.community
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                                                            {typeof row.pro === 'boolean' ? (
                                                                row.pro ? <CheckIcon className="w-4 h-4 text-cyan-500 font-bold" /> : <span className="text-slate-300 dark:text-slate-600">—</span>
                                                            ) : (
                                                                row.pro
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-4 font-semibold text-purple-600 dark:text-purple-400">
                                                            {typeof row.enterprise === 'boolean' ? (
                                                                row.enterprise ? <CheckIcon className="w-4 h-4 text-purple-500 font-bold" /> : <span className="text-slate-300 dark:text-slate-600">—</span>
                                                            ) : (
                                                                row.enterprise
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* TAB 3: Instant Key Activation */}
                                {activeTab === 'activate' && (
                                    <div className="mt-6 max-w-xl mx-auto p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500">
                                                <KeyIcon className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                                                    Activate Your Licencia Key
                                                </h4>
                                                <p className="text-xs text-slate-500">
                                                    Purchased a license on Licencia or received an offline key? Enter it below.
                                                </p>
                                            </div>
                                        </div>

                                        <form onSubmit={handleActivateKey} className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                                    License Key
                                                </label>
                                                <input
                                                    type="text"
                                                    value={licenseKeyInput}
                                                    onChange={(e) => setLicenseKeyInput(e.target.value)}
                                                    placeholder="LIC-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                                />
                                            </div>

                                            <div className="p-3 rounded-xl bg-cyan-500/[0.04] border border-cyan-500/20 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                                                <p className="font-semibold text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
                                                    <ShieldCheckIcon className="w-4 h-4" />
                                                    Online & Hybrid Offline Leases Supported
                                                </p>
                                                <p className="text-[11px] text-slate-500">
                                                    Conman automatically registers this node's hardware fingerprint and requests a cryptographically signed lease token.
                                                </p>
                                            </div>

                                            <button
                                                type="submit"
                                                disabled={activating || !licenseKeyInput.trim()}
                                                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 disabled:opacity-50 transition-all shadow-md flex items-center justify-center gap-2"
                                            >
                                                {activating ? (
                                                    <>
                                                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                                        <span>Validating with Licencia...</span>
                                                    </>
                                                ) : (
                                                    <span>Activate License Now</span>
                                                )}
                                            </button>
                                        </form>
                                    </div>
                                )}

                                {/* Footer & Licencia Platform Attribution */}
                                <div className="mt-8 pt-4 border-t border-slate-100 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                                        <span>Secure subscription management & key generation powered by <strong>Licencia Platform</strong></span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <a 
                                            href="https://licencia.deziss.com" 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="hover:text-cyan-500 transition-colors flex items-center gap-1"
                                        >
                                            <span>Licencia Portal</span>
                                            <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                                        </a>
                                        <span>•</span>
                                        <span>Part of the Deziss Suite</span>
                                    </div>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};
