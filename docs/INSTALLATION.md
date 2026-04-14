# Installation Guide

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **Server** | 1 CPU, 512 MB RAM | 2 CPU, 2 GB RAM |
| **Agent** | 0.1 CPU, 64 MB RAM | 0.5 CPU, 128 MB RAM |
| **OS** | Linux amd64 (kernel 4.18+) | Ubuntu 22.04+, RHEL 9+, Debian 12+ |
| **Go** (build only) | 1.24+ | 1.24+ |
| **Node** (build only) | 22 (LTS) | 22 (LTS) |

## Server Installation

### Using .deb Package (Debian, Ubuntu)

```bash
sudo dpkg -i conman-server_1.0.0_amd64.deb
```

This installs:
- `/usr/bin/conman-server` -- server binary
- `/usr/share/conman/static/` -- web dashboard files
- `/etc/conman/server.env` -- configuration (edit this)
- `/etc/conman/authz/model.conf` -- RBAC policy
- `/usr/lib/systemd/system/conman-server.service` -- systemd unit
- `/var/lib/conman/` -- database and data directory
- `/var/log/conman/` -- log directory

A `conman` system user is created automatically.

### Using .rpm Package (RHEL, Fedora, CentOS)

```bash
sudo rpm -i conman-server-1.0.0-1.x86_64.rpm
```

Same file layout as the .deb package.

### Post-Install Configuration

Edit the configuration file:

```bash
sudo vi /etc/conman/server.env
```

**Required changes for production:**

```bash
# Generate a random secret key
SECRET_KEY=$(openssl rand -hex 32)

# Set a strong agent token (agents must use this same value)
AGENT_TOKEN=$(openssl rand -hex 16)

# Change default admin password
ADMIN_PASSWORD=your-strong-password
```

**Optional: Use PostgreSQL instead of SQLite:**

```bash
DATABASE_DRIVER=postgres
DATABASE_DSN=host=localhost port=5432 user=conman password=secret dbname=conman sslmode=disable
```

### Start the Server

```bash
sudo systemctl start conman-server
sudo systemctl enable conman-server    # auto-start on boot

# Check status
sudo systemctl status conman-server

# View logs
sudo journalctl -u conman-server -f
```

Dashboard: http://your-server:5173

### Firewall

Open port 5173 (or your configured `PORT`):

```bash
# UFW (Ubuntu)
sudo ufw allow 5173/tcp

# firewalld (RHEL/Fedora)
sudo firewall-cmd --permanent --add-port=5173/tcp
sudo firewall-cmd --reload
```

---

## Agent Installation

### Using .deb Package

```bash
sudo dpkg -i conman-agent_1.0.0_amd64.deb
```

This installs:
- `/usr/bin/conman-agent` -- agent binary
- `/etc/conman-agent/agent.env` -- configuration (edit this)
- `/usr/lib/systemd/system/conman-agent.service` -- systemd unit
- `/var/lib/conman-agent/` -- persistent agent ID and report buffer

### Using .rpm Package

```bash
sudo rpm -i conman-agent-1.0.0-1.x86_64.rpm
```

### Post-Install Configuration

```bash
sudo vi /etc/conman-agent/agent.env
```

**Required changes:**

```bash
# Point to your conman server
CONMAN_SERVER_URL=http://your-server:5173

# Must match the server's AGENT_TOKEN
CONMAN_SERVER_TOKEN=your-agent-token
```

### Start the Agent

```bash
sudo systemctl start conman-agent
sudo systemctl enable conman-agent

# Check status
sudo systemctl status conman-agent

# View logs
sudo journalctl -u conman-agent -f
```

The agent auto-detects the container runtime. Check the log output:

```
Auto-detected container runtime: docker at unix:///var/run/docker.sock
Successfully registered with server
```

---

## Runtime-Specific Setup

### Docker

Docker is the default runtime. Ensure the Docker socket is accessible:

```bash
# Verify Docker is running
docker info

# The agent needs access to /var/run/docker.sock
# The agent runs as root by default (systemd), so this works automatically
```

### Podman

```bash
sudo vi /etc/conman-agent/agent.env
```

```bash
# For rootful Podman
RUNTIME_TYPE=podman
RUNTIME_SOCKET_PATH=/run/podman/podman.sock

# For rootless Podman
RUNTIME_TYPE=podman
RUNTIME_SOCKET_PATH=/run/user/1000/podman/podman.sock
RUNTIME_USE_CLI=true
```

Enable the Podman socket (for API mode):

```bash
# Rootful
sudo systemctl enable --now podman.socket

# Rootless (run as your user)
systemctl --user enable --now podman.socket
```

### containerd

No Docker or Podman required. Just containerd:

```bash
sudo vi /etc/conman-agent/agent.env
```

```bash
RUNTIME_TYPE=containerd
RUNTIME_SOCKET_PATH=/run/containerd/containerd.sock

# Optional: specify namespace (default: "default")
# Kubernetes uses "k8s.io"
CONTAINERD_NAMESPACE=default
```

Ensure containerd is running:

```bash
sudo systemctl status containerd
```

**Note:** containerd has some limitations compared to Docker:
- Networks: containerd uses CNI plugins, not built-in networking. Network listing returns empty.
- Volumes: Mapped to snapshotter info. Limited volume management.
- Compose: Requires `nerdctl` in PATH for stack operations.
- Interactive exec/log streaming: Not yet supported via the runtime interface.

---

## Docker Compose Installation

### Development (Single Node)

```bash
git clone https://github.com/deziss/conman.git
cd conman
docker compose -f docker-compose.simple.yml up -d
```

Dashboard: http://localhost:5173 -- Login: `admin@example.com` / `admin`

### Production (Scaled with PostgreSQL)

```bash
export AGENT_TOKEN=your-secret-psk
export SECRET_KEY=your-jwt-secret
export POSTGRES_PASSWORD=your-pg-password

docker compose -f docker-compose.scaled.yml up -d

# Scale to 3 backend instances behind Kong
docker compose -f docker-compose.scaled.yml up -d --scale conman-backend=3
```

- Dashboard: http://localhost:8080 (via Kong)
- Kong Admin: http://localhost:8001

---

## Building From Source

### Prerequisites

- Go 1.24+
- Node.js 20+
- nfpm (`go install github.com/goreleaser/nfpm/v2/cmd/nfpm@latest`)

### Build Packages

```bash
# Build all .deb and .rpm packages
./packaging/build-packages.sh

# Custom version
VERSION=2.0.0 ./packaging/build-packages.sh
```

### Build Binaries Only

```bash
# Server (requires CGO for SQLite)
cd backend && CGO_ENABLED=1 go build -o conman-server ./cmd/server

# Agent (static binary, no CGO)
cd agent && CGO_ENABLED=0 go build -o conman-agent ./cmd/agent
```

---

## Uninstallation

```bash
# Stop services first
sudo systemctl stop conman-server conman-agent

# Debian/Ubuntu
sudo dpkg -r conman-server
sudo dpkg -r conman-agent

# RHEL/Fedora
sudo rpm -e conman-server
sudo rpm -e conman-agent

# Data is preserved in /var/lib/conman/ and /var/lib/conman-agent/
# Remove manually if no longer needed:
sudo rm -rf /var/lib/conman /var/lib/conman-agent /etc/conman /etc/conman-agent
```

---

## Troubleshooting

### Server won't start

```bash
# Check logs
sudo journalctl -u conman-server -n 50 --no-pager

# Common issues:
# - Port already in use: change PORT in /etc/conman/server.env
# - Database permission denied: check /var/lib/conman/ ownership
# - Missing STATIC_DIR: ensure /usr/share/conman/static/ exists
```

### Agent can't connect to server

```bash
# Check agent logs
sudo journalctl -u conman-agent -n 50 --no-pager

# Common issues:
# - Wrong CONMAN_SERVER_URL: verify server is reachable
# - Token mismatch: CONMAN_SERVER_TOKEN must match server's AGENT_TOKEN
# - Firewall: ensure port 5173 is open between agent and server
```

### Agent can't access container runtime

```bash
# Check runtime detection
sudo journalctl -u conman-agent | grep "Auto-detected"

# Docker: ensure socket exists
ls -la /var/run/docker.sock

# Podman: ensure socket is enabled
sudo systemctl status podman.socket

# containerd: ensure service is running
sudo systemctl status containerd
```
