# Changelog

All notable changes to the Conman project are documented in this file.

## [Unreleased] - 2026-04-08

### Added

#### Multi-Runtime Support (Agent)
- **Runtime abstraction layer** (`agent/internal/runtime/`) with `ContainerRuntime` interface supporting Docker and Podman
- **Docker provider** -- Full implementation using Docker Go SDK for containers, images, networks, volumes, compose
- **Podman provider** -- API mode (Docker-compatible socket) and CLI mode (rootless `podman` binary fallback)
- **Rootless port validation** -- `ValidateRootlessPort()` and `ValidateComposePorts()` for Podman rootless restrictions
- **Runtime factory** -- Auto-selects provider based on `RUNTIME_TYPE` environment variable
- **Structured logging** (`agent/internal/log/`) -- JSON-formatted, leveled, correlation-ID-aware logging
- **Retry logic** (`agent/internal/retry/`) -- Exponential backoff with configurable max attempts, jitter, and timeout

#### Production Hardening (Backend)
- **Agent authentication** -- `AgentAuthMiddleware` validates `X-Agent-Token` PSK on all agent-facing endpoints
- **PostgreSQL support** -- Dual-driver config (`DATABASE_DRIVER=sqlite|postgres`) with transparent GORM switch
- **Agent state persistence** -- `AgentSnapshot` model stores full agent state in DB; survives backend restarts
- **Time-series metrics** -- `MetricsStore` in `backend/internal/metrics/` with TimescaleDB hypertable support
- **Historical metrics API** -- `GET /metrics/containers/{id}` and `GET /agents/{id}/metrics` with time-range queries
- **Prometheus instrumentation** -- `/metrics` endpoint, Chi middleware for request count/latency, agent/report gauges
- **Alert system** -- `AlertRule`, `AlertChannel`, `AlertEvent` models with evaluator loop and webhook notifications
- **Alert API** -- Full CRUD for rules, channels; event listing with agent/resolved filters
- **Agent tags** -- `Tags` field on Agent model; `PUT /agents/{id}/tags`; `GET /agents?tag=` filtering
- **Write queue** -- Buffered channel with 4-worker pool for report ingestion, replacing ad-hoc goroutines
- **Health endpoint** -- `/api/v1/health` now checks DB connectivity and Docker daemon status

#### Agent Reliability
- **Persistent agent ID** -- Auto-generated UUID saved to `/var/lib/conman-agent/agent-id`; survives restarts
- **Exponential backoff** -- Registration blocks with backoff (5s-60s, up to 5min). Push/heartbeat failures use jittered backoff
- **Report buffering** -- On-disk JSON-lines buffer at `/var/lib/conman-agent/report-buffer.jsonl` (max 100 reports); drained on reconnect

#### Deployment
- **`docker-compose.simple.yml`** -- Updated with `AGENT_TOKEN`, `DATABASE_DRIVER`, optional PostgreSQL service (profile: postgres)
- **`docker-compose.scaled.yml`** -- New: PostgreSQL + N stateless backend instances behind Kong API Gateway
- **`kong-scaled.yml`** -- Kong declarative config with upstream health checks

### Fixed
- Removed debug `agent_report_dump.json` file writing from `ReceiveReport`
- Fixed corrupted `log.go` and `retry.go` files (reversed/concatenated code from previous agent)
- Fixed missing `os`/`os/exec` imports in `runtime/docker.go`
- Fixed missing closing brace in `DockerProvider.RemoveStack()`
- Fixed `InspectContainer` type mismatches (port types, command string, created timestamp, NetworkMode)
- Fixed `InspectImage` not handling 3 return values from `ImageInspectWithRaw`
- Fixed `RemoveImage` not discarding first return value
- Fixed `RemoveVolume` using non-existent `volume.RemoveOptions` (API takes bool directly)
- Fixed `ValidateComposePorts` only checking first port line (early `break`)
- Fixed duplicate `TestPodmanProviderCLIMode` across test files
- Fixed duplicate `package retry` declaration in test file
- Fixed missing `encoding/json` import in log test file
- Migrated `api.go` from non-existent `a.docker` field to `a.dockerClient()` helper (24 references)
- Migrated `pusher.go` event watcher from `a.docker.Events()` to `a.dockerClient().Events()`
- Added `ImageUpdate` protocol type referenced by runtime interface but missing from protocol package

### Changed
- Agent struct now uses `runtime.ContainerRuntime` interface instead of direct `*client.Client`
- `NewAgentHandler` now accepts `*metrics.MetricsStore` parameter
- Report ingestion uses write queue workers instead of unbounded goroutines
- CORS headers now include `X-Agent-Token`
