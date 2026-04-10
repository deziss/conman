# Conman: Multi-Host Container Management Platform

Conman is a platform for managing and monitoring containers across multiple hosts. It provides a web dashboard, REST API, real-time metrics, alerting, and remote container control via lightweight agents. Supports **Docker**, **Podman**, and **containerd** natively -- no Docker installation required on monitored hosts.

## Architecture

```
                         +-------------------+
                         |   Web Dashboard   |
                         |   (React 19 SPA)  |
                         +--------+----------+
                                  |
                         +--------v----------+
                         |   Conman Server    |
                         |  (Go REST + WS)   |
                         |  SQLite / Postgres |
                         +----+----+----+----+
                              |    |    |
              +---------------+    |    +---------------+
              |                    |                    |
     +--------v-------+  +--------v-------+  +---------v------+
     |  Agent (Docker) |  | Agent (Podman) |  | Agent(containerd)|
     |  Host A         |  |  Host B        |  |  Host C         |
     +----------------+  +----------------+  +-----------------+
```

**Server** (`backend/`) -- Go REST API + WebSocket server with Chi router, GORM ORM, Casbin RBAC, Prometheus metrics, and built-in alerting. Supports SQLite (dev) and PostgreSQL (production).

**Agent** (`agent/`) -- Lightweight Go binary (~18MB) deployed on each monitored host. Collects container/image/network/volume metrics and pushes reports to the server. Auto-detects Docker, Podman, or containerd at startup.

**Frontend** (`frontend/`) -- React 19 SPA with TanStack Query, Tailwind CSS, xterm.js terminal, and Recharts for real-time dashboards.

## Installation

### Option 1: Docker Compose (quickest)

```bash
docker compose -f docker-compose.simple.yml up -d
```

Dashboard: http://localhost:5173 -- Login: `admin@example.com` / `admin`

### Option 2: Linux Packages (.deb / .rpm)

```bash
# Debian / Ubuntu
sudo dpkg -i conman-server_1.0.0_amd64.deb
sudo vi /etc/conman/server.env           # set SECRET_KEY, AGENT_TOKEN
sudo systemctl start conman-server

# RHEL / Fedora
sudo rpm -i conman-server-1.0.0-1.x86_64.rpm
sudo vi /etc/conman/server.env
sudo systemctl start conman-server
```

Install agents on monitored hosts:

```bash
# Debian / Ubuntu
sudo dpkg -i conman-agent_1.0.0_amd64.deb
sudo vi /etc/conman-agent/agent.env      # set CONMAN_SERVER_URL, CONMAN_SERVER_TOKEN
sudo systemctl start conman-agent

# RHEL / Fedora
sudo rpm -i conman-agent-1.0.0-1.x86_64.rpm
sudo vi /etc/conman-agent/agent.env
sudo systemctl start conman-agent
```

### Option 3: Production (PostgreSQL + Horizontal Scaling)

```bash
export AGENT_TOKEN=your-secret-psk
export SECRET_KEY=your-jwt-secret
export POSTGRES_PASSWORD=your-pg-password
docker compose -f docker-compose.scaled.yml up -d --scale conman-backend=3
```

Uses Kong API Gateway for load balancing with active health checks.

### Building Packages From Source

Prerequisites: Go 1.24+, Node 20+, nfpm

```bash
# Build all .deb and .rpm packages
./packaging/build-packages.sh

# Or with custom version
VERSION=2.0.0 ./packaging/build-packages.sh
```

Output in `dist/`:
- `conman-server_1.0.0_amd64.deb` / `.rpm` (~12 MB)
- `conman-agent_1.0.0_amd64.deb` / `.rpm` (~7 MB)

## Container Runtime Support

The agent auto-detects the available runtime at startup. Set `RUNTIME_TYPE` to override.

| Runtime | Socket Path | Notes |
|---------|------------|-------|
| Docker | `/var/run/docker.sock` | Full feature support (default) |
| Podman | `/run/podman/podman.sock` | API + CLI modes, rootless support |
| containerd | `/run/containerd/containerd.sock` | Native gRPC, namespace-aware |

```bash
# Auto-detect (default)
RUNTIME_TYPE=auto

# Explicit containerd with Kubernetes namespace
RUNTIME_TYPE=containerd
RUNTIME_SOCKET_PATH=/run/containerd/containerd.sock
CONTAINERD_NAMESPACE=k8s.io
```

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for detailed setup guides per runtime.

## Configuration Reference

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for all environment variables.

## API Reference

See [docs/API.md](docs/API.md) for complete endpoint documentation.

## Project Structure

```
conman/
  backend/                 # Go backend server
    cmd/server/            # Entry point
    internal/
      api/                 # HTTP handlers (agents, alerts, containers, etc.)
      alerts/              # Alert evaluator and webhook notifier
      authz/               # Casbin RBAC
      config/              # Viper configuration
      metrics/             # Time-series metrics store (TimescaleDB-ready)
      middleware/           # Auth + agent token middleware
      models/              # GORM data models
      observability/        # Prometheus instrumentation
      service/             # Docker client, stats collector, compose
    pkg/protocol/          # Shared protocol types
  agent/                   # Go agent binary
    cmd/agent/             # Entry point
    internal/
      agent/               # Core agent logic, pusher, buffer, API handlers
      log/                 # Structured JSON logging
      retry/               # Exponential backoff retry
      runtime/             # ContainerRuntime interface + Docker/Podman/containerd
    pkg/protocol/          # Shared protocol types
  frontend/                # React 19 + TypeScript SPA
    src/
      pages/               # Route pages
      components/          # UI components (Terminal, Logs, Charts, etc.)
      services/            # Axios API client
      contexts/            # Auth, Host, Theme, Settings contexts
  packaging/               # Linux package build infrastructure
    systemd/               # Service unit files
    scripts/               # Pre/post install scripts
    nfpm-server.yaml       # Server package definition
    nfpm-agent.yaml        # Agent package definition
    build-packages.sh      # One-command package builder
```

## Development

```bash
# Backend
cd backend && go build ./... && go test ./...

# Agent
cd agent && go build ./... && go test ./...

# Frontend
cd frontend && npm install && npm run dev
```

## License

MIT
