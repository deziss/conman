# Conman Agent Architecture

## Overview

The Conman Agent is a lightweight Go binary (~18MB) deployed on each host that runs containers. It collects runtime data and reports it to the central Conman server.

## Agent Responsibilities

1. **Registration** - Registers with the server on startup, sends host info (OS, CPU, memory, runtime type/version)
2. **Collection** - Periodically collects containers, images, networks, volumes, and metrics from the container runtime
3. **Reporting** - Sends collected data to the server via WebSocket or HTTP POST
4. **Proxied Operations** - Executes container/image operations (start, stop, remove, pull, prune, inspect) on behalf of the server

## Data Collection Flow

```
Agent starts
  -> Detects runtime (Docker/Podman/containerd)
  -> Registers with server (POST /api/agents/register)
  -> Starts collection loop (default: 10s interval)
     -> collectContainers() -> runtime.ListContainers()
     -> collectImages()     -> runtime.ListImages()
     -> collectNetworks()   -> runtime.ListNetworks()
     -> collectVolumes()    -> runtime.ListVolumes()
     -> collectMetrics()    -> runtime.ContainerStats() per running container
  -> Sends AgentReport to server
  -> Server stores in AgentState (in-memory)
```

## Runtime Interface

File: `agent/internal/runtime/runtime.go`

The agent abstracts container runtimes behind a common interface:

```go
type Runtime interface {
    ListContainers(ctx, all) -> []protocol.Container
    ListImages(ctx, all)     -> []protocol.Image
    ListNetworks(ctx)        -> []protocol.Network
    ListVolumes(ctx)         -> []protocol.Volume
    ContainerStats(ctx, id)  -> protocol.ContainerMetrics
    InspectContainer(ctx, id)
    InspectImage(ctx, id)
    StartContainer / StopContainer / RemoveContainer
    PullImage / RemoveImage
    // ... etc
}
```

Implementations:
- `docker.go` - Docker and Podman (via Docker-compatible API)
- `containerd.go` - containerd (via containerd client)

## Protocol Types

File: `backend/pkg/protocol/types.go` (shared between agent and backend)

Key types sent in agent reports:
- `AgentReport` - Top-level report containing all collected data
- `Container` - Container info with `ID`, `Name`, `Image`, `ImageID`, `State`, `Status`, `Ports`, `Labels`
- `Image` - Image info with `ID`, `RepoTags`, `Size`, `Created`, `Containers` count
- `ContainerMetrics` - Per-container metrics: CPU%, memory usage/limit, network Rx/Tx, block I/O
- `SystemStats` - Host-level CPU, memory, disk usage
- `HostInfo` - Hostname, OS, architecture, runtime type/version

## Agent API Endpoints

The agent exposes an HTTP API for proxied operations from the server:

```
POST   /api/containers/{id}/start
POST   /api/containers/{id}/stop
POST   /api/containers/{id}/restart
DELETE /api/containers/{id}
GET    /api/containers/{id}/inspect
GET    /api/containers/{id}/logs
GET    /api/containers/{id}/exec

GET    /api/images
GET    /api/images/inspect?id={id}
DELETE /api/images/{id}
POST   /api/images/pull
POST   /api/images/prune
GET    /api/images/check-update?id={id}

GET    /api/networks
POST   /api/networks
DELETE /api/networks/{id}

GET    /api/volumes
```

## Server-Side Agent State

File: `backend/internal/api/agents.go`

The server maintains an `AgentState` per registered agent:

```go
type AgentState struct {
    ID, Name, Status, Mode       // Identity
    HostInfo                     // Host details
    Stats                        // System-level CPU/memory/disk
    Containers []protocol.Container
    Metrics    map[string]protocol.ContainerMetrics  // keyed by container ID
    Images     []protocol.Image
    Networks   []protocol.Network
    Volumes    []protocol.Volume
    Events     []protocol.ContainerEvent
    LastHeartbeat, LastReport    // Timestamps
}
```

## Server-Side Enrichment

The `GetAgent*` handlers enrich raw agent data before returning to the frontend:

- **GetAgentContainers** - Merges `agent.Metrics[containerID]` into each container (cpu_usage, memory_usage, disk_io, network_rx/tx)
- **GetAgentImages** - Computes `status` ("used"/"unused") by cross-referencing images with containers via ImageID and RepoTags

## License Enforcement at Registration

When an agent calls `POST /api/agents/register`, the backend checks the host limit before creating a new record:

```go
if h.License != nil && !h.License.CanAddHost() {
    // returns 403 with upgrade message
}
```

- Community tier: max 1 host
- Pro tier: max 10 hosts
- Enterprise: unlimited

Existing agents (already registered) are unaffected by tier changes. The limit only applies when registering a new agent.

## Configuration

Agent environment variables:
- `AGENT_NAME` - Display name for the agent
- `CONMAN_SERVER_URL` - Server WebSocket/HTTP URL
- `CONMAN_SERVER_TOKEN` - PSK for authentication
- `AGENT_MODE` - `hybrid` (push reports + accept proxied ops)
- `COLLECT_INTERVAL` - Collection frequency (default: `10s`)
- `SCRAPE_PORT` - Prometheus metrics port
- `SCRAPE_ENABLED` - Enable Prometheus endpoint
- `ADVERTISED_ADDRESS` - Address the server uses to reach this agent

## Deployment

Agents can be deployed as:
- Docker container (via `docker-compose.simple.yml` or `docker-compose.agent.yml`)
- Systemd service (via DEB/RPM packages from `packaging/`)
- Standalone binary
