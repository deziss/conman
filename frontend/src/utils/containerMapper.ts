
// Interface matching backend/pkg/protocol/types.go Container struct
export interface AgentContainer {
  id: string;
  name: string;
  image: string;
  image_id: string;
  command: string;
  created: number;
  state: string;
  status: string;
  ports: Array<{
    ip: string;
    private_port: number;
    public_port: number;
    type: string;
  }>;
  labels: Record<string, string>;
  network_mode: string;
  mounts: Array<{
    type: string;
    name: string;
    source: string;
    destination: string;
    driver: string;
    mode: string;
    rw: boolean;
  }>;
}

// Interface matching ContainerDetails.tsx state
export interface ContainerDetailsView {
  Id: string;
  Name: string;
  State: {
    Status: string;
    Running: boolean;
    Paused: boolean;
    StartedAt: string;
    Pid: number;
  };
  Created: string;
  Image: string;
  Config: {
    Cmd: string[];
    Entrypoint: string[];
    WorkingDir: string;
    Env: string[];
    Labels: Record<string, string>;
    User: string;
    Tty: boolean;
    OpenStdin: boolean;
    AttachStdin: boolean;
    AttachStdout: boolean;
    AttachStderr: boolean;
  };
  NetworkSettings: {
    IPAddress: string;
    Gateway: string;
    MacAddress: string;
    Networks: Record<string, any>;
    Ports: Record<string, Array<{ HostIp: string; HostPort: string }> | null>;
  };
  Mounts: Array<{
    Type: string;
    Source: string;
    Destination: string;
    Mode: string;
    RW: boolean;
    Driver: string;
    Name: string;
    Propagation: string;
  }>;
  HostConfig: {
    NetworkMode: string;
    RestartPolicy: { Name: string; MaximumRetryCount: number };
    Privileged: boolean;
    ReadonlyRootfs: boolean;
    // ... add others if needed, defaults provided below
    CapAdd: string[];
    CapDrop: string[];
    SecurityOpt: string[];
    CpuShares: number;
    Memory: number;
    NanoCpus: number;
  };
  Platform: string;
  Driver: string;
  GraphDriver: {
      Name: string;
      Data: Record<string, string>;
  };
}

export const mapAgentContainerToDetails = (agentContainer: AgentContainer): ContainerDetailsView => {
  // Map Ports to NetworkSettings.Ports format
  const portsMap: Record<string, Array<{ HostIp: string; HostPort: string }>> = {};
  if (agentContainer.ports) {
      agentContainer.ports.forEach(p => {
          const key = `${p.private_port}/${p.type}`;
          if (!portsMap[key]) portsMap[key] = [];
          if (p.public_port) {
              portsMap[key].push({
                  HostIp: p.ip || '0.0.0.0',
                  HostPort: String(p.public_port)
              });
          }
      });
  }

  // Map Mounts
  const mounts = (agentContainer.mounts || []).map(m => ({
      Type: m.type,
      Source: m.source,
      Destination: m.destination,
      Mode: m.mode,
      RW: m.rw,
      Driver: m.driver,
      Name: m.name,
      Propagation: ''
  }));

  return {
    Id: agentContainer.id,
    Name: agentContainer.name,
    State: {
      Status: agentContainer.state,
      Running: agentContainer.state === 'running',
      Paused: agentContainer.state === 'paused',
      StartedAt: new Date(agentContainer.created * 1000).toISOString(), // Approx since we don't have start time
      Pid: 0 // Not available in agent report
    },
    Created: new Date(agentContainer.created * 1000).toISOString(),
    Image: agentContainer.image,
    Config: {
      Cmd: agentContainer.command ? agentContainer.command.split(' ') : [],
      Entrypoint: [],
      WorkingDir: '', // Not available
      Env: [], // Not available
      Labels: agentContainer.labels || {},
      User: '',
      Tty: false,
      OpenStdin: false,
      AttachStdin: false,
      AttachStdout: false,
      AttachStderr: false
    },
    NetworkSettings: {
      IPAddress: '', // Not available in basic report
      Gateway: '',
      MacAddress: '',
      Networks: {},
      Ports: portsMap
    },
    Mounts: mounts,
    HostConfig: {
      NetworkMode: agentContainer.network_mode,
      RestartPolicy: { Name: 'unknown', MaximumRetryCount: 0 },
      Privileged: false,
      ReadonlyRootfs: false,
      CapAdd: [],
      CapDrop: [],
      SecurityOpt: [],
      CpuShares: 0,
      Memory: 0,
      NanoCpus: 0
    },
    Platform: 'linux',
    Driver: '',
    GraphDriver: { Name: '', Data: {} }
  };
};
