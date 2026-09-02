export interface FormattedPort {
  publicPort?: number | string;
  privatePort?: number | string;
  type?: string;
  ip?: string;
  display: string;
  url?: string;
}

export const parseContainerPorts = (ports: any[], hostIp?: string): FormattedPort[] => {
  if (!ports || !Array.isArray(ports)) return [];

  // Determine host IP or hostname to construct clickable URL
  let targetHost = window.location.hostname;
  if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1' && hostIp !== '0.0.0.0') {
    targetHost = hostIp;
  }

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
