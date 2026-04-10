# Configuration Reference

All configuration is done via environment variables. For systemd installations, edit the env files:
- Server: `/etc/conman/server.env`
- Agent: `/etc/conman-agent/agent.env`

For Docker Compose, set them in the `environment` section or a `.env` file.

---

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | HTTP server port |
| `DATABASE_DRIVER` | `sqlite` | Database driver: `sqlite` or `postgres` |
| `DATABASE_URL` | `app.db` | SQLite database file path |
| `DATABASE_DSN` | *(see below)* | PostgreSQL connection string |
| `SECRET_KEY` | `your-secret-key-here` | JWT signing key. **Change in production.** |
| `MASTER_API_KEY` | `conman-master-secret-key` | System admin API key. **Change in production.** |
| `AGENT_TOKEN` | *(empty)* | Pre-shared key for agent authentication. Required for agents to connect. |
| `ADMIN_EMAIL` | `admin@example.com` | Initial admin user email (created on first start) |
| `ADMIN_PASSWORD` | `admin` | Initial admin password. Updated on every restart to match this value. |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed CORS origins |
| `STATIC_DIR` | *(empty)* | Path to frontend build directory. Set to serve the web dashboard from the same binary. |
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Docker socket for local container management |

### PostgreSQL DSN Format

```
host=localhost port=5432 user=conman password=secret dbname=conman sslmode=disable
```

### Security Notes

- `SECRET_KEY`, `MASTER_API_KEY`, and `AGENT_TOKEN` ship with insecure defaults. Always change them before exposing the server to a network.
- The admin password is re-applied from `ADMIN_PASSWORD` on every server restart. This serves as a recovery mechanism.
- Agent endpoints require the `AGENT_TOKEN` to be set on the server. If empty, agent registration is rejected.

---

## Agent Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_ID` | *(auto-generated)* | Persistent UUID. Auto-generated and saved to `/var/lib/conman-agent/agent-id` on first run. |
| `AGENT_NAME` | *(hostname)* | Display name shown in the dashboard |
| `CONMAN_SERVER_URL` | `http://localhost:8080` | URL of the Conman server |
| `CONMAN_SERVER_TOKEN` | *(empty)* | Must match the server's `AGENT_TOKEN` |
| `AGENT_MODE` | `hybrid` | Communication mode: `push`, `scrape`, or `hybrid` |

### Runtime Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `RUNTIME_TYPE` | `auto` | Container runtime: `auto`, `docker`, `podman`, or `containerd` |
| `RUNTIME_SOCKET_PATH` | *(auto-detected)* | Path to the container runtime socket |
| `RUNTIME_USE_CLI` | `false` | Use CLI fallback instead of API (Podman rootless) |
| `CONTAINERD_NAMESPACE` | `default` | containerd namespace (`default`, `k8s.io`, etc.) |

**Auto-detection order** (when `RUNTIME_TYPE=auto`):
1. `/var/run/docker.sock` -- Docker
2. `/run/podman/podman.sock` -- Podman (rootful)
3. `$XDG_RUNTIME_DIR/podman/podman.sock` -- Podman (rootless)
4. `/run/containerd/containerd.sock` -- containerd
5. Fallback: Docker (default socket)

### Collection Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `COLLECT_INTERVAL` | `10s` | How often to collect container/image/network data |
| `METRICS_INTERVAL` | `5s` | How often to collect CPU/memory metrics |
| `HEARTBEAT_INTERVAL` | `30s` | How often to send heartbeat to server |
| `COLLECT_CONTAINERS` | `true` | Enable container collection |
| `COLLECT_IMAGES` | `true` | Enable image collection |
| `COLLECT_NETWORKS` | `true` | Enable network collection |
| `COLLECT_VOLUMES` | `true` | Enable volume collection |
| `COLLECT_METRICS` | `true` | Enable CPU/memory metrics collection |
| `COLLECT_EVENTS` | `true` | Enable Docker/containerd event watching |

### Scrape Server Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `SCRAPE_ENABLED` | `true` | Enable the HTTP scrape server (for scrape/hybrid mode) |
| `SCRAPE_PORT` | `5073` | Port for the scrape server |
| `ADVERTISED_ADDRESS` | *(empty)* | Hostname/IP the server should use to reach this agent for scraping |

### Push Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `PUSH_ENABLED` | `true` | Enable push mode (send reports to server) |
| `PUSH_BATCH_SIZE` | `100` | Maximum metrics per push batch |

---

## File Paths (Package Installation)

### Server

| Path | Purpose |
|------|---------|
| `/usr/bin/conman-server` | Server binary |
| `/etc/conman/server.env` | Configuration file |
| `/etc/conman/authz/model.conf` | Casbin RBAC policy |
| `/usr/share/conman/static/` | Frontend web assets |
| `/var/lib/conman/` | Database and data |
| `/var/log/conman/` | Logs |
| `/usr/lib/systemd/system/conman-server.service` | Systemd unit |

### Agent

| Path | Purpose |
|------|---------|
| `/usr/bin/conman-agent` | Agent binary |
| `/etc/conman-agent/agent.env` | Configuration file |
| `/var/lib/conman-agent/` | Persistent agent ID, report buffer |
| `/usr/lib/systemd/system/conman-agent.service` | Systemd unit |

---

## Communication Modes

### Push Mode (`AGENT_MODE=push`)

The agent actively sends data to the server at `COLLECT_INTERVAL`. The server doesn't need to reach the agent.

- Best for: NAT'd environments, firewalled agents
- Data flow: Agent -> Server

### Scrape Mode (`AGENT_MODE=scrape`)

The server periodically fetches data from the agent's HTTP endpoint. The server needs network access to the agent on `SCRAPE_PORT`.

- Best for: Pull-based monitoring setups
- Data flow: Server -> Agent

### Hybrid Mode (`AGENT_MODE=hybrid`, default)

Both push and scrape are active. The agent pushes reports and also exposes a scrape endpoint for on-demand queries (exec, logs, file browsing).

- Best for: Most deployments (recommended)
- Data flow: Bidirectional
