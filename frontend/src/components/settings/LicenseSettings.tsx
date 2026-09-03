import { useState } from 'react';
import { useLicense } from '../../contexts/LicenseContext';
import { TIER_LABELS, TIER_COLORS, FEATURE_LABELS, ALL_FEATURES } from '../../types/license';
import { GlassCard } from '../ui/GlassCard';
import { toast } from 'react-hot-toast';
import { ShieldCheckIcon, CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import { SparklesIcon, RocketLaunchIcon } from '@heroicons/react/24/outline';
import { SubscriptionModal } from '../modals/SubscriptionModal';

export const LicenseSettings = () => {
  const { license, loading, activateLicense, deactivateLicense, refreshLicense, hasFeature } = useLicense();
  const [keyInput, setKeyInput] = useState('');
  const [activating, setActivating] = useState(false);
  const [validating, setValidating] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;

    setActivating(true);
    try {
      await activateLicense(keyInput.trim());
      toast.success('License activated successfully');
      setKeyInput('');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to activate license');
    } finally {
      setActivating(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      await deactivateLicense();
      toast.success('License deactivated');
    } catch {
      toast.error('Failed to deactivate license');
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      await refreshLicense();
      toast.success('License validated');
    } catch {
      toast.error('Validation failed');
    } finally {
      setValidating(false);
    }
  };

  if (loading || !license) {
    return <div className="text-slate-500 animate-pulse">Loading license info...</div>;
  }

  const tierColor = TIER_COLORS[license.tier];
  const hostPercent = license.max_hosts > 0
    ? Math.min(100, Math.round((license.current_hosts / license.max_hosts) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ShieldCheckIcon className="w-6 h-6 text-cyan-500" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Current Plan</h3>
          </div>
          <div className="flex items-center gap-2.5">
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${tierColor}`}>
              {TIER_LABELS[license.tier]}
            </span>
            <button
              onClick={() => setIsSubscriptionModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 rounded-xl shadow-md shadow-cyan-500/20 transition-all"
            >
              <SparklesIcon className="w-3.5 h-3.5" />
              <span>{license.tier === 'enterprise' ? 'Manage Subscription' : 'Upgrade Plan'}</span>
            </button>
          </div>
        </div>

        {/* Host Usage */}
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-500">Host Usage</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">
              {license.current_hosts} / {license.max_hosts < 0 ? 'Unlimited' : license.max_hosts}
            </span>
          </div>
          {license.max_hosts > 0 && (
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${hostPercent >= 90 ? 'bg-rose-500' : hostPercent >= 70 ? 'bg-amber-500' : 'bg-cyan-500'}`}
                style={{ width: `${hostPercent}%` }}
              />
            </div>
          )}
        </div>

        {/* Expiry */}
        {license.expiry && (
          <div className="flex justify-between text-sm mb-4">
            <span className="text-slate-500">Expires</span>
            <span className="text-slate-700 dark:text-slate-300">
              {new Date(license.expiry).toLocaleDateString()}
            </span>
          </div>
        )}

        {/* Features */}
        <div>
          <p className="text-sm font-medium text-slate-500 mb-3">Features</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_FEATURES.map(feature => {
              const enabled = hasFeature(feature);
              return (
                <div key={feature} className={`flex items-center gap-2 text-sm py-1 ${enabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600'}`}>
                  {enabled
                    ? <CheckCircleIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    : <XCircleIcon className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                  }
                  <span>{FEATURE_LABELS[feature] || feature}</span>
                </div>
              );
            })}
          </div>
        </div>
      </GlassCard>

      {/* Grace Period Warning */}
      {license.grace_period && (
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-700 dark:text-amber-300">
          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">License validation offline</p>
            <p className="mt-1 text-amber-600 dark:text-amber-400">
              Grace period active until {license.grace_period_end ? new Date(license.grace_period_end).toLocaleString() : 'unknown'}.
              Features will revert to Community tier when the grace period expires.
            </p>
          </div>
        </div>
      )}

      {/* License Key Management */}
      <GlassCard className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">License Key</h3>

        {license.license_key_masked && (
          <div className="flex items-center justify-between mb-4 p-3 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
            <span className="font-mono text-sm text-slate-600 dark:text-slate-400">{license.license_key_masked}</span>
            <button
              onClick={handleDeactivate}
              className="text-xs text-rose-500 hover:text-rose-600 font-medium transition-colors"
            >
              Deactivate
            </button>
          </div>
        )}

        <form onSubmit={handleActivate} className="flex gap-3">
          <input
            type="text"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Enter license key..."
            className="flex-1 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all font-mono"
          />
          <button
            type="submit"
            disabled={activating || !keyInput.trim()}
            className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-cyan-500/20"
          >
            {activating ? 'Activating...' : 'Activate'}
          </button>
        </form>

        {license.error && !license.grace_period && (
          <p className="text-xs text-amber-500 mt-2">{license.error}</p>
        )}
      </GlassCard>

      {/* Validation Status */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-slate-500">Last Validated</h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
              {license.last_validated ? new Date(license.last_validated).toLocaleString() : 'Never'}
            </p>
          </div>
          <button
            onClick={handleValidate}
            disabled={validating}
            className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <ArrowPathIcon className={`w-4 h-4 ${validating ? 'animate-spin' : ''}`} />
            Re-validate
          </button>
        </div>
      </GlassCard>

      {/* Licencia Subscription Banner */}
      <GlassCard className="p-6 bg-gradient-to-r from-cyan-500/[0.04] via-indigo-500/[0.03] to-purple-500/[0.04] border-cyan-500/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-500 shrink-0">
              <RocketLaunchIcon className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                Licencia Subscription Plans & Benefits
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
                Compare Community, Pro, and Enterprise tiers. Unlock Docker Compose stacks, multi-host fleets, tamper-evident audit logs, and priority Com0 alerts.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsSubscriptionModalOpen(true)}
            className="px-4 py-2 text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl shadow-md transition-all shrink-0 self-start sm:self-center flex items-center gap-1.5"
          >
            <SparklesIcon className="w-4 h-4" />
            <span>View All Plans & Benefits</span>
          </button>
        </div>
      </GlassCard>

      <SubscriptionModal
        isOpen={isSubscriptionModalOpen}
        onClose={() => setIsSubscriptionModalOpen(false)}
      />
    </div>
  );
};
