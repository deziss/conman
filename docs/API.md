# API Reference

Base URL: `/api/v1`

## Authentication

All protected endpoints require one of:
- **JWT Token**: `Authorization: Bearer <token>` (obtained from login)
- **API Key**: `X-API-Key: <key>` (generated in profile)
- **Master Key**: `X-Master-Key: <key>` (configured in server env)

Agent endpoints require:
- **Agent Token**: `X-Agent-Token: <token>` (must match server's `AGENT_TOKEN`)

---

## Auth

### POST /auth/login

Login with email and password.

**Request:**
```json
{
    "email": "admin@example.com",
    "password": "admin"
}
```

**Response (200):**
```json
{
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
        "id": 1,
        "email": "admin@example.com",
        "full_name": "Admin User",
        "role": "admin"
    }
}
```

---

## Health & Monitoring

### GET /api/v1/health

Public health check. Returns DB and Docker status.

**Response (200):**
```json
{
    "status": "healthy",
    "checks": {
        "database": "ok",
        "docker": "ok"
    }
}
```

Status values: `healthy`, `degraded` (Docker down), `unhealthy` (DB down, returns 503).

### GET /metrics

Prometheus-format metrics endpoint (public).

Metrics exposed:
- `conman_http_requests_total{method, path, status}`
- `conman_http_request_duration_seconds{method, path}`
- `conman_agents_total{status}`
- `conman_containers_total`
- `conman_report_ingest_total`
- `conman_report_ingest_errors_total`
- `conman_websocket_connections`

---

## Agents (Multi-Host)

### GET /agents

List all registered agents.

**Query Parameters:**
- `tag` -- Filter by tag (e.g., `?tag=production`)
- `runtime` -- Filter by runtime type (e.g., `?runtime=containerd`)

**Response (200):**
```json
[
    {
        "id": "abc-123-...",
        "name": "prod-host-01",
        "host_info": {
            "hostname": "prod-host-01",
            "os": "Ubuntu 22.04",
            "runtime_type": "docker",
            "runtime_version": "26.0.0",
            "cpus": 4,
            "memory_total": 8589934592
        },
        "status": "healthy",
        "runtime_type": "docker",
        "last_heartbeat": "2026-04-08T10:00:00Z",
        "containers": [...],
        "images": [...]
    }
]
```

### GET /agents/{id}

Get a specific agent with full state (containers, images, networks, volumes, metrics).

### DELETE /agents/{id}

Remove an agent registration.

### PUT /agents/{id}/tags

Update tags for an agent.

**Request:**
```json
{
    "tags": ["production", "us-east", "gpu"]
}
```

### GET /agents/{id}/containers

List containers on a specific agent.

### GET /agents/{id}/images

List images on a specific agent.

### GET /agents/{id}/networks

List networks on a specific agent.

### GET /agents/{id}/volumes

List volumes on a specific agent.

### GET /agents/{id}/containers/{containerId}/exec

WebSocket endpoint. Proxied interactive terminal to a container on a remote agent.

### GET /agents/{id}/containers/{containerId}/logs

WebSocket endpoint. Proxied log streaming from a container on a remote agent.

### GET /agents/{id}/containers/{containerId}/stats

WebSocket endpoint. Proxied real-time stats from a container on a remote agent.

### POST /agents/{id}/containers/{containerId}/start|stop|restart

Container lifecycle operations proxied to a remote agent.

### DELETE /agents/{id}/containers/{containerId}

Remove a container on a remote agent.

### POST /agents/{id}/images/pull

Pull an image on a remote agent.

### DELETE /agents/{id}/images/{imageId}

Remove an image on a remote agent.

### GET /agents/{id}/system/df

Get disk usage information from a remote agent.

---

## Containers (Local Docker)

### GET /docker/containers

List containers on the local Docker daemon.

### GET /docker/containers/{id}

Inspect a local container.

### POST /docker/containers/{id}/start|stop|pause|unpause|restart

Container lifecycle operations.

### DELETE /docker/containers/{id}

Remove a local container.

### GET /docker/containers/{id}/exec

WebSocket endpoint. Interactive terminal session.

### GET /docker/containers/{id}/logs

WebSocket endpoint. Real-time log streaming.

### GET /docker/containers/{id}/stats

WebSocket endpoint. Real-time CPU/memory/network stats.

### GET /docker/containers/{id}/files

List files inside a container.

### GET /docker/containers/{id}/files/download

Download a file from a container.

---

## Images

### GET /docker/images

List all images.

### GET /docker/images/{id}

Inspect an image.

### POST /docker/images/pull

Pull an image.

**Request:**
```json
{
    "image": "nginx:latest"
}
```

### DELETE /docker/images/{id}

Remove an image.

### GET /docker/images/{id}/check-update

Check if an image has updates available.

### POST /docker/prune/images

Remove unused images.

---

## Networks

### GET /docker/networks

List all networks.

### POST /docker/networks

Create a network.

### DELETE /docker/networks/{id}

Remove a network.

### POST /docker/networks/{id}/duplicate

Duplicate a network configuration.

### POST /docker/networks/{id}/connect

Connect a container to a network.

### POST /docker/networks/{id}/disconnect

Disconnect a container from a network.

---

## Volumes

### GET /docker/volumes

List all volumes.

### POST /docker/volumes

Create a volume.

### DELETE /docker/volumes/{name}

Remove a volume.

### POST /docker/volumes/prune

Remove unused volumes.

### POST /docker/volumes/{name}/browse

Browse volume contents.

---

## Stacks (Docker Compose)

### GET /stacks

List all stacks.

### POST /stacks

Create and deploy a stack.

**Request:**
```json
{
    "name": "my-stack",
    "compose_content": "version: '3'\nservices:\n  web:\n    image: nginx",
    "env_content": ""
}
```

### GET /stacks/{id}

Get stack details.

### PUT /stacks/{id}

Update a stack's compose configuration.

### POST /stacks/{id}/stop

Stop all services in a stack.

### DELETE /stacks/{id}

Remove a stack and its services.

---

## Historical Metrics

### GET /metrics/containers/{containerId}

Query historical metrics for a container.

**Query Parameters:**
- `from` -- Start time (RFC3339, e.g., `2026-04-08T00:00:00Z`)
- `to` -- End time (RFC3339)
- `limit` -- Max results (default 1000)
- `agent_id` -- Filter by agent

**Response (200):**
```json
[
    {
        "time": "2026-04-08T10:05:00Z",
        "agent_id": "abc-123",
        "container_id": "def-456",
        "container_name": "nginx",
        "cpu_percent": 2.5,
        "memory_usage": 52428800,
        "memory_percent": 1.2,
        "network_rx": 1024000,
        "network_tx": 512000,
        "pids": 5
    }
]
```

### GET /agents/{id}/metrics

Query historical metrics for all containers on an agent. Same query parameters as above.

---

## Alerts

### GET /alerts/rules

List all alert rules.

### POST /alerts/rules

Create an alert rule.

**Request:**
```json
{
    "name": "Agent Offline Alert",
    "type": "agent_offline",
    "config": "{\"timeout_minutes\": 5}",
    "enabled": true
}
```

### PUT /alerts/rules/{id}

Update an alert rule.

### DELETE /alerts/rules/{id}

Delete an alert rule and its events.

### GET /alerts/channels

List notification channels.

### POST /alerts/channels

Create a notification channel.

**Request:**
```json
{
    "name": "Slack Alerts",
    "type": "webhook",
    "config": "{\"url\": \"https://hooks.slack.com/services/...\", \"headers\": {}}"
}
```

### PUT /alerts/channels/{id}

Update a notification channel.

### DELETE /alerts/channels/{id}

Delete a notification channel.

### GET /alerts/events

List fired alert events.

**Query Parameters:**
- `agent_id` -- Filter by agent
- `resolved` -- Filter by resolution status (`true` or `false`)

---

## Users

### GET /users

List all users. Requires `admin` role.

### POST /users

Create a user. Requires `admin` role.

**Request:**
```json
{
    "email": "operator@example.com",
    "password": "secure-password",
    "full_name": "Jane Ops",
    "role": "operator"
}
```

Roles: `admin`, `operator`, `viewer`

### PUT /users/{id}

Update a user.

---

## Profile (Self-Service)

### GET /profile/keys

List your API keys.

### POST /profile/keys

Generate a new API key.

### DELETE /profile/keys/{id}

Revoke an API key.

---

## System

### GET /docker/system/info

Docker daemon information.

### GET /docker/system/df

Docker disk usage.

### GET /docker/system/stats

System resource usage (CPU, memory, disk).

### POST /docker/prune/containers

Remove stopped containers.

---

## Error Responses

All errors return JSON:

```json
{
    "error": "Description of the error"
}
```

Common status codes:
- `400` -- Bad request (invalid input)
- `401` -- Unauthorized (missing or invalid token)
- `403` -- Forbidden (insufficient permissions)
- `404` -- Not found
- `429` -- Rate limited
- `500` -- Internal server error
- `502` -- Bad gateway (agent unreachable)
- `503` -- Service unavailable (health check failed)
