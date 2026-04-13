export type LicenseTier = 'community' | 'pro' | 'enterprise';

export interface LicenseInfo {
  tier: LicenseTier;
  valid: boolean;
  max_hosts: number;
  current_hosts: number;
  features: string[];
  expiry: string | null;
  grace_period: boolean;
  grace_period_end: string | null;
  last_validated: string;
  error: string;
  license_key_masked: string;
}

export const TIER_LABELS: Record<LicenseTier, string> = {
  community: 'Community',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export const TIER_COLORS: Record<LicenseTier, string> = {
  community: 'text-slate-500 bg-slate-500/10 border-slate-500/20',
  pro: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20',
  enterprise: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
};

export const FEATURE_LABELS: Record<string, string> = {
  stacks: 'Stack Management',
  alerts: 'Alert System',
  multi_host: 'Multi-Host',
  update_check: 'Image Update Checking',
  rbac: 'Role-Based Access Control',
  sso: 'Single Sign-On',
  audit_logs: 'Audit Logs',
};

export const ALL_FEATURES = ['stacks', 'alerts', 'multi_host', 'update_check', 'rbac', 'sso', 'audit_logs'];
