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

export const parseContainerPorts = (ports: any, hostObjOrIp?: any): FormattedPort[] => {
  if (!ports) return [];

  let portList: any[] = [];
  if (Array.isArray(ports)) {
    portList = ports;
  } else if (typeof ports === 'object') {
    // Docker inspect NetworkSettings.Ports format: { "80/tcp": [{ HostIp: "...", HostPort: "8080" }] }
    Object.entries(ports).forEach(([privKey, bindings]) => {
      const [priv, proto = 'tcp'] = privKey.split('/');
      if (Array.isArray(bindings) && bindings.length > 0) {
        bindings.forEach((b: any) => {
          portList.push({
            PublicPort: b.HostPort,
            PrivatePort: priv,
            Type: proto,
            IP: b.HostIp,
          });
        });
      } else {
        portList.push({
          PrivatePort: priv,
          Type: proto,
        });
      }
    });
  }

  const targetHost = resolveHostAddress(hostObjOrIp);
  const results: FormattedPort[] = [];
  const seenKeys = new Set<string>();

  portList.forEach((p) => {
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

export interface PortRangeGroup {
  id: string;
  isRange: boolean;
  type: string;
  display: string;
  publicDisplay?: string;
  privateDisplay?: string;
  startPublic?: number;
  endPublic?: number;
  startPrivate?: number;
  endPrivate?: number;
  count: number;
  ports: FormattedPort[];
  url?: string;
}

export const groupPortRanges = (ports: FormattedPort[]): PortRangeGroup[] => {
  if (!ports || ports.length === 0) return [];

  const groups: PortRangeGroup[] = [];
  const mapped: FormattedPort[] = [];
  const unmapped: FormattedPort[] = [];

  ports.forEach((p) => {
    const pubNum = typeof p.publicPort === 'number' ? p.publicPort : parseInt(String(p.publicPort ?? ''), 10);
    const privNum = typeof p.privatePort === 'number' ? p.privatePort : parseInt(String(p.privatePort ?? ''), 10);
    if (!isNaN(pubNum) && !isNaN(privNum)) {
      mapped.push({ ...p, publicPort: pubNum, privatePort: privNum });
    } else {
      unmapped.push(p);
    }
  });

  // Sort mapped ports by protocol, then publicPort, then privatePort
  mapped.sort((a, b) => {
    const protoCmp = (a.type || 'tcp').localeCompare(b.type || 'tcp');
    if (protoCmp !== 0) return protoCmp;
    return (Number(a.publicPort) - Number(b.publicPort)) || (Number(a.privatePort) - Number(b.privatePort));
  });

  let currentRange: FormattedPort[] = [];

  const flushRange = () => {
    if (currentRange.length === 0) return;
    if (currentRange.length === 1) {
      const p = currentRange[0];
      groups.push({
        id: `port-${p.publicPort}-${p.privatePort}-${p.type}`,
        isRange: false,
        type: p.type || 'tcp',
        display: p.display,
        ports: [p],
        count: 1,
        url: p.url
      });
    } else {
      const first = currentRange[0];
      const last = currentRange[currentRange.length - 1];
      const pubStart = Number(first.publicPort);
      const pubEnd = Number(last.publicPort);
      const privStart = Number(first.privatePort);
      const privEnd = Number(last.privatePort);
      const proto = (first.type || 'tcp').toLowerCase();

      const samePort = pubStart === privStart && pubEnd === privEnd;
      const display = samePort ? `${pubStart}-${pubEnd}` : `${pubStart}-${pubEnd}:${privStart}-${privEnd}`;

      groups.push({
        id: `range-${pubStart}-${pubEnd}-${privStart}-${privEnd}-${proto}`,
        isRange: true,
        type: proto,
        display,
        publicDisplay: `${pubStart}-${pubEnd}`,
        privateDisplay: `${privStart}-${privEnd}`,
        startPublic: pubStart,
        endPublic: pubEnd,
        startPrivate: privStart,
        endPrivate: privEnd,
        count: currentRange.length,
        ports: [...currentRange],
        url: first.url
      });
    }
    currentRange = [];
  };

  for (let i = 0; i < mapped.length; i++) {
    const p = mapped[i];
    if (currentRange.length === 0) {
      currentRange.push(p);
    } else {
      const prev = currentRange[currentRange.length - 1];
      const sameProto = (prev.type || 'tcp').toLowerCase() === (p.type || 'tcp').toLowerCase();
      const isConsecutivePub = Number(p.publicPort) === Number(prev.publicPort) + 1;
      const isConsecutivePriv = Number(p.privatePort) === Number(prev.privatePort) + 1;

      if (sameProto && isConsecutivePub && isConsecutivePriv) {
        currentRange.push(p);
      } else {
        flushRange();
        currentRange.push(p);
      }
    }
  }
  flushRange();

  // Add unmapped ports
  unmapped.forEach((p, idx) => {
    groups.push({
      id: `unmapped-${idx}-${p.display}`,
      isRange: false,
      type: p.type || 'tcp',
      display: p.display,
      ports: [p],
      count: 1,
      url: p.url
    });
  });

  return groups;
};

