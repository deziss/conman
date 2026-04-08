# Conman: Multi-Host Container Management Platform

Conman is a platform for managing and monitoring Docker and Podman containers across multiple hosts. It provides a web dashboard, REST API, real-time metrics, alerting, and remote container control via agents deployed on each host.

## Architecture

```
Frontend (React 19)  -->  Backend (Go/Chi)  -->  Local Docker Socket
                              |
                              +--> Agent (Go) on Host A  -->  Docker/Podman
                              +--> Agent (Go) on Host B  -->  Docker/Podman
                              +--> PostgreSQL (metrics, state)
```

**Backend** (`backend/`) -- Go REST API + WebSocket server. Manages users, agents, stacks, and proxies commands to remote agents. Supports SQLite (dev) and PostgreSQL (production).

**Agent** (`agent/`) -- Lightweight Go binary deployed on each monitored host. Collects container/image/network/volume metrics and pushes reports to the backend. Supports Docker and Podman via a pluggable runtime interface.

**Frontend** (`frontend/`) -- React 19 SPA with TanStack Query, Tailwind CSS, xterm.js terminal, and Recharts for real-time dashboards.

## Quick Start

### Development (Docker Compose)

```bash
docker compose -f docker-compose.simple.yml up -d
```

- Dashboard: http://localhost:5173
- Default login: `admin@example.com` / `admin`

### Production (PostgreSQL + Horizontal Scaling)

```bash
export AGENT_TOKEN=your-secret-psk
export SECRET_KEY=your-jwt-secret
export POSTGRES_PASSWORD=your-pg-password
docker compose -f docker-compose.scaled.yml --profile postgres up -d

# Scale backend instances:
docker compose -f docker-compose.scaled.yml up -d --scale conman-backend=3
```

## Configuration

### Backend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | HTTP server port |
| `DATABASE_DRIVER` | `sqlite` | `sqlite` or `postgres` |
| `DATABASE_URL` | `app.db` | SQLite file path |
| `DATABASE_DSN` | *(see config)* | PostgreSQL connection string |
| `SECRET_KEY` | *(insecure default)* | JWT signing key |
| `MASTER_API_KEY` | *(insecure default)* | System admin API key |
| `AGENT_TOKEN` | *(empty)* | Pre-shared key for agent authentication |
| `ADMIN_EMAIL` | `admin@example.com` | Initial admin user email |
| `ADMIN_PASSWORD` | `admin` | Initial admin user password |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed CORS origins |
| `STATIC_DIR` | *(empty)* | Path to frontend build (unified mode) |

### Agent Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_ID` | *(auto-generated)* | Persistent agent UUID |
| `AGENT_NAME` | *(hostname)* | Display name |
| `CONMAN_SERVER_URL` | `http://localhost:8080` | Backend server URL |
| `CONMAN_SERVER_TOKEN` | *(empty)* | Must match backend `AGENT_TOKEN` |
| `AGENT_MODE` | `hybrid` | `push`, `scrape`, or `hybrid` |
| `RUNTIME_TYPE` | `docker` | `docker` or `podman` |
| `RUNTIME_SOCKET_PATH` | `unix:///var/run/docker.sock` | Container runtime socket |
| `RUNTIME_USE_CLI` | `false` | Use CLI fallback (Podman rootless) |
| `COLLECT_INTERVAL` | `10s` | Data collection interval |
| `METRICS_INTERVAL` | `5s` | Metrics collection interval |
| `HEARTBEAT_INTERVAL` | `30s` | Heartbeat interval |
| `SCRAPE_PORT` | `5073` | HTTP port for scrape mode |

## API Overview

All API endpoints are under `/api/v1`. Authentication via JWT token (`Authorization: Bearer <token>`), API key (`X-API-Key`), or master key (`X-Master-Key`).

### Authentication
- `POST /auth/login` -- Login with email/password, returns JWT

### Containers (Local)
- `GET /docker/containers` -- List containers
- `POST /docker/containers/{id}/start|stop|restart` -- Container lifecycle
- `GET /docker/containers/{id}/exec` -- WebSocket terminal
- `GET /docker/containers/{id}/logs` -- Stream logs

### Agents (Multi-Host)
- `GET /agents` -- List registered agents (supports `?tag=` filtering)
- `GET /agents/{id}` -- Agent details with containers, metrics
- `PUT /agents/{id}/tags` -- Update agent tags
- `GET /agents/{id}/containers/{cid}/exec` -- Proxied WebSocket terminal
- `GET /agents/{id}/containers/{cid}/logs` -- Proxied log streaming

### Metrics
- `GET /metrics/containers/{id}?from=&to=&limit=` -- Historical container metrics
- `GET /agents/{id}/metrics?from=&to=` -- All metrics for an agent

### Alerts
- `GET/POST /alerts/rules` -- Manage alert rules
- `GET/POST /alerts/channels` -- Manage notification channels (webhook)
- `GET /alerts/events` -- View fired alerts

### Monitoring
- `GET /api/v1/health` -- Health check (DB + Docker status)
- `GET /metrics` -- Prometheus metrics endpoint

## Multi-Runtime Support (Docker & Podman)

The agent supports both Docker and Podman through a pluggable `ContainerRuntime` interface.

```bash
# Docker (default)
RUNTIME_TYPE=docker
RUNTIME_SOCKET_PATH=unix:///var/run/docker.sock

# Podman (API mode)
RUNTIME_TYPE=podman
RUNTIME_SOCKET_PATH=/run/user/1000/podman/podman.sock

# Podman (CLI fallback for rootless)
RUNTIME_TYPE=podman
RUNTIME_USE_CLI=true
```

See [MULTI_RUNTIME_IMPLEMENTATION.md](MULTI_RUNTIME_IMPLEMENTATION.md) for details.

## Project Structure

```
conman/
  backend/               # Go backend server
    cmd/server/          # Entry point
    internal/
      api/               # HTTP handlers (agents, alerts, containers, etc.)
      alerts/            # Alert evaluator and webhook notifier
      authz/             # Casbin RBAC
      config/            # Viper configuration
      metrics/           # Time-series metrics store (TimescaleDB-ready)
      middleware/        # Auth + agent token middleware
      models/            # GORM data models
      observability/     # Prometheus instrumentation
      service/           # Docker client, stats collector, compose
    pkg/protocol/        # Shared protocol types
  agent/                 # Go agent binary
    cmd/agent/           # Entry point
    internal/
      agent/             # Core agent logic, pusher, buffer, API handlers
      log/               # Structured JSON logging
      retry/             # Exponential backoff retry
      runtime/           # ContainerRuntime interface + Docker/Podman providers
    pkg/protocol/        # Shared protocol types
  frontend/              # React 19 + TypeScript SPA
    src/
      pages/             # Route pages (Dashboard, Containers, Hosts, etc.)
      components/        # UI components (Terminal, Logs, Charts, etc.)
      services/          # Axios API client
      contexts/          # Auth, Host, Theme contexts
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
