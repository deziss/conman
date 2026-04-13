import { Link } from 'react-router-dom';
import { LockClosedIcon, ArrowRightIcon } from '@heroicons/react/24/solid';
import { TIER_LABELS } from '../../types/license';
import type { LicenseTier } from '../../types/license';

interface UpgradePromptProps {
  feature: string;
  requiredTier?: LicenseTier;
}

export const UpgradePrompt = ({ feature, requiredTier = 'pro' }: UpgradePromptProps) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-6">
      <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-6">
        <LockClosedIcon className="w-12 h-12 text-slate-400 dark:text-slate-500" />
      </div>
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
        {feature} requires {TIER_LABELS[requiredTier]}
      </h2>
      <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8">
        This feature is available on the {TIER_LABELS[requiredTier]} plan and above.
        Upgrade your license to unlock it.
      </p>
      <Link
        to="/settings"
        className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors shadow-lg shadow-cyan-500/20"
      >
        Go to License Settings
        <ArrowRightIcon className="w-4 h-4" />
      </Link>
    </div>
  );
};
