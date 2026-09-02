export interface Activity {
  ID: number;
  CreatedAt: string;
  UpdatedAt: string;
  agent_id: string;
  agent_name: string;
  type: 'container' | 'image' | 'volume' | 'network' | 'stack' | 'host' | 'user' | 'system';
  action: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  target_id: string;
  target_name: string;
  actor: string;
  actor_type: 'user' | 'system' | 'engine' | 'external';
  details: string;
  exit_code?: string;
  reason?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface ActivityStats {
  total_24h: number;
  oom_kills: number;
  crashes: number;
  user_actions: number;
}
