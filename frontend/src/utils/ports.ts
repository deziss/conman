export interface FormattedPort {
  publicPort?: number | string;
  privatePort?: number | string;
  type?: string;
  ip?: string;
  display: string;
  url?: string;
}

const isIPv4 = (val?: string): boolean => {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = Number(p);
    return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p;
  });
};

const extractIPFromURL = (urlStr?: string): string | null => {
  if (!urlStr) return null;
  try {
    const u = new URL(urlStr.startsWith('http') ? urlStr : `http://${urlStr}`);
    if (isIPv4(u.hostname)) return u.hostname;
    // If it's a domain/FQDN (e.g. host1.mycorp.internal)
    if (u.hostname && u.hostname.includes('.') && !u.hostname.endsWith('.local') && u.hostname !== 'localhost') {
      return u.hostname;
    }
  } catch {}
  return null;
};

export const isLocalAgent = (host?: any): boolean => {
  if (!host) return true;
  if (typeof host === 'string') {
    const s = host.toLowerCase().trim();
    return s.includes('local') || s === 'localhost' || s === '127.0.0.1' || s.startsWith('conman');
  }

  const name = (host.name || '').toLowerCase().trim();
  const id = (host.id || '').toLowerCase().trim();
  const hostname = (host.host_info?.hostname || '').toLowerCase().trim();
  const mode = (host.mode || '').toLowerCase().trim();
  const tags = Array.isArray(host.tags) ? host.tags.map((t: string) => String(t).toLowerCase().trim()) : [];

  if (
    mode === 'local' ||
    tags.includes('local') ||
    name.includes('local') ||
    name === 'conman' ||
    name === 'conman-agent' ||
    name === 'conman-local-agent' ||
    hostname === 'conman-local-agent' ||
    hostname === 'conman-server' ||
    hostname.startsWith('conman-') ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    id === 'local' ||
    id.includes('local')
  ) {
    return true;
  }

  if (host.scrape_url) {
    const s = host.scrape_url.toLowerCase();
    if (s.includes('localhost') || s.includes('127.0.0.1') || s.includes('conman-local-agent') || s.includes('conman-server')) {
      return true;
    }
  }

  // If no remote IP or remote scrape URL is provided, it's local
  if (!host.ip && !host.address && !host.scrape_url && !host.endpoint) {
    return true;
  }

  return false;
};

export const resolveHostAddress = (host?: any): string => {
  // If it is the local agent -> always localhost:<port>
  if (!host || isLocalAgent(host)) {
    return 'localhost';
  }

  // If host is a direct string IP or hostname
  if (typeof host === 'string') {
    if (isIPv4(host)) return host.trim();
    return 'localhost';
  }

  // Remote agent: extract the remote IP / address
  if (isIPv4(host.ip)) {
    return host.ip.trim();
  }

  if (isIPv4(host.address)) {
    return host.address.trim();
  }

  const scrapeIp = extractIPFromURL(host.scrape_url);
  if (scrapeIp && scrapeIp !== '127.0.0.1' && scrapeIp !== '0.0.0.0' && scrapeIp !== 'localhost') {
    return scrapeIp;
  }

  const endpointIp = extractIPFromURL(host.endpoint);
  if (endpointIp && endpointIp !== '127.0.0.1' && endpointIp !== '0.0.0.0' && endpointIp !== 'localhost') {
    return endpointIp;
  }

  if (host.host_info?.hostname && isIPv4(host.host_info.hostname)) {
    return host.host_info.hostname.trim();
  }

  // If user is accessing Conman remotely (e.g. 10.10.110.42), use that IP if it's an IP
  if (window.location.hostname && isIPv4(window.location.hostname)) {
    return window.location.hostname;
  }

  return 'localhost';
};

export const parseContainerPorts = (ports: any[], hostObjOrIp?: any): FormattedPort[] => {
  if (!ports || !Array.isArray(ports)) return [];

  const targetHost = resolveHostAddress(hostObjOrIp);
  const results: FormattedPort[] = [];
  const seenKeys = new Set<string>();

  ports.forEach((p) => {
    let portObj: FormattedPort | null = null;
    let key = '';

    if (typeof p === 'object' && p !== null) {
      const pub = p.PublicPort || p.public_port || p.publicPort;
      const priv = p.PrivatePort || p.private_port || p.privatePort;
      const type = (p.Type || p.type || 'tcp').toLowerCase();
      const ip = p.IP || p.ip || '';

      if (pub && priv) {
        key = `${pub}:${priv}/${type}`;
        portObj = {
          publicPort: pub,
          privatePort: priv,
          type,
          ip,
          display: `${pub}:${priv}`,
          url: `http://${targetHost}:${pub}`
        };
      } else if (priv) {
        key = `${priv}/${type}`;
        portObj = {
          privatePort: priv,
          type,
          ip,
          display: `${priv}/${type}`
        };
      }
    } else if (typeof p === 'string') {
      const arrowMatch = p.match(/(?:.*:)?(\d+)->(\d+)(?:\/(\w+))?/);
      if (arrowMatch) {
        const pub = arrowMatch[1];
        const priv = arrowMatch[2];
        const type = (arrowMatch[3] || 'tcp').toLowerCase();
        key = `${pub}:${priv}/${type}`;
        portObj = {
          publicPort: pub,
          privatePort: priv,
          type,
          display: `${pub}:${priv}`,
          url: `http://${targetHost}:${pub}`
        };
      } else {
        const colonMatch = p.match(/(\d+):(\d+)/);
        if (colonMatch) {
          const pub = colonMatch[1];
          const priv = colonMatch[2];
          key = `${pub}:${priv}/tcp`;
          portObj = {
            publicPort: pub,
            privatePort: priv,
            type: 'tcp',
            display: `${pub}:${priv}`,
            url: `http://${targetHost}:${pub}`
          };
        } else {
          key = p.trim();
          portObj = {
            display: p.trim()
          };
        }
      }
    }

    if (portObj && key && !seenKeys.has(key)) {
      seenKeys.add(key);
      results.push(portObj);
    }
  });

  return results;
};
