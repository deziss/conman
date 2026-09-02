export interface FormattedPort {
  publicPort?: number | string;
  privatePort?: number | string;
  type?: string;
  ip?: string;
  display: string;
  url?: string;
}

const isValidHostOrIp = (val?: string): boolean => {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed || trimmed.includes(' ') || trimmed.includes('%20')) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === 'local agent' ||
    lower === 'local-agent' ||
    lower === 'local' ||
    lower === 'unnamed'
  ) {
    return false;
  }
  // IPv4 regex, standard domain/hostname regex, or simple valid alphanumeric host
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const hostRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  const simpleHost = /^[a-zA-Z0-9\-_]+$/;
  return ipRegex.test(trimmed) || hostRegex.test(trimmed) || simpleHost.test(trimmed);
};

export const resolveHostAddress = (host?: any): string => {
  let fallback = window.location.hostname || 'localhost';
  if (fallback === '0.0.0.0') fallback = 'localhost';

  if (!host) return fallback;

  if (typeof host === 'string') {
    return isValidHostOrIp(host) ? host.trim() : fallback;
  }

  // 1. If scrape_url is set (e.g. http://192.168.1.100:5073)
  if (host.scrape_url) {
    try {
      const u = new URL(host.scrape_url.startsWith('http') ? host.scrape_url : `http://${host.scrape_url}`);
      if (isValidHostOrIp(u.hostname)) {
        return u.hostname;
      }
    } catch {}
  }

  // 2. If host.ip is set and valid
  if (isValidHostOrIp(host.ip)) {
    return host.ip.trim();
  }

  // 3. If host.address is set and valid
  if (isValidHostOrIp(host.address)) {
    return host.address.trim();
  }

  // 4. If host.endpoint is set
  if (host.endpoint) {
    try {
      const ep = host.endpoint.startsWith('http') ? host.endpoint : `http://${host.endpoint}`;
      const u = new URL(ep);
      if (isValidHostOrIp(u.hostname)) {
        return u.hostname;
      }
    } catch {}
  }

  // 5. If host_info.hostname is a valid network address (not "localhost" or local machine display name)
  if (host.host_info?.hostname && isValidHostOrIp(host.host_info.hostname)) {
    // Only use if it looks like an IP or FQDN
    if (host.host_info.hostname.includes('.') && !host.host_info.hostname.toLowerCase().endsWith('.local')) {
      return host.host_info.hostname.trim();
    }
  }

  return fallback;
};

export const parseContainerPorts = (ports: any[], hostObjOrIp?: any): FormattedPort[] => {
  if (!ports || !Array.isArray(ports)) return [];

  const targetHost = resolveHostAddress(hostObjOrIp);
  const results: FormattedPort[] = [];

  ports.forEach((p) => {
    if (typeof p === 'object' && p !== null) {
      const pub = p.PublicPort || p.public_port || p.publicPort;
      const priv = p.PrivatePort || p.private_port || p.privatePort;
      const type = (p.Type || p.type || 'tcp').toLowerCase();
      const ip = p.IP || p.ip || '';

      if (pub && priv) {
        results.push({
          publicPort: pub,
          privatePort: priv,
          type,
          ip,
          display: `${pub}:${priv}`,
          url: `http://${targetHost}:${pub}`
        });
      } else if (priv) {
        results.push({
          privatePort: priv,
          type,
          ip,
          display: `${priv}/${type}`
        });
      }
    } else if (typeof p === 'string') {
      const arrowMatch = p.match(/(?:.*:)?(\d+)->(\d+)(?:\/(\w+))?/);
      if (arrowMatch) {
        const pub = arrowMatch[1];
        const priv = arrowMatch[2];
        const type = (arrowMatch[3] || 'tcp').toLowerCase();
        results.push({
          publicPort: pub,
          privatePort: priv,
          type,
          display: `${pub}:${priv}`,
          url: `http://${targetHost}:${pub}`
        });
        return;
      }
      const colonMatch = p.match(/(\d+):(\d+)/);
      if (colonMatch) {
        const pub = colonMatch[1];
        const priv = colonMatch[2];
        results.push({
          publicPort: pub,
          privatePort: priv,
          type: 'tcp',
          display: `${pub}:${priv}`,
          url: `http://${targetHost}:${pub}`
        });
        return;
      }
      results.push({
        display: p
      });
    }
  });

  return results;
};
