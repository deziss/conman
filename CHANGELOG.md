# Changelog

All notable changes to the Conman project are documented in this file.

## [1.2.0] - 2026-09-21

### Changed

- **Relicensed from MIT to AGPL-3.0-or-later.** Full license text added as `LICENSE`; `packaging/nfpm-server.yaml` and `packaging/nfpm-agent.yaml` now declare `AGPL-3.0-or-later`. The network clause applies: running a modified Conman as a network service obliges you to offer that modified source to its users.
- README rewritten for people evaluating the project rather than people already using it — what Conman is for and who it is not for, a feature table, dashboard/containers/hosts screenshots (`docs/images/`), an edition comparison matching `models.DefaultFeatures`, collapsible production install paths, and badges for CI, release, license, and toolchain versions.

### Fixed

- **The frontend did not boot in dev mode.** 20 type-only imports (`ReactNode`, `LicenseInfo`, `Activity`, `ErrorInfo`, `LogEntry`, `BackgroundTask`, `ComponentType`, and others) were written as value imports. With `verbatimModuleSyntax: true` they are emitted as real runtime imports, so Vite failed with `The requested module '/src/types/license.ts' does not provide an export named 'LicenseInfo'` and the app rendered a blank page. All 20 now use the `type` modifier.

### Known issues

- `npx tsc --noEmit` type-checks nothing. The root `tsconfig.json` is solution-style (`"files": []` plus `references`), and `tsc --noEmit` does not follow project references — only `tsc -b` does. Both the CI "Type check" step and the `build` script (`tsc && vite build`) therefore pass unconditionally, which is how the type-import breakage above reached `main`. `tsc -b` currently reports 132 remaining errors (77 × TS6133 unused locals, plus ~13 genuine type errors); switching CI over is deferred until those are cleared.

## [1.1.0] - 2026-09-08

### Security

- **RBAC enforcement on all multi-host agent routes** (`internal/api/agents.go`) — ~45 routes (container/image/volume/network/stack management, exec shell, file upload/download) previously sat behind auth only, with zero permission checks. Now gated by `RequirePermission(obj, act)` grouped by resource (`agents`, `containers`, `images`, `volumes`, `networks`, `stacks`) × `read`/`write`, matching the pattern already used for single-host Docker routes.
- **RBAC itself is now an Enterprise license feature.** `middleware.RequirePermission` checks the `rbac` feature — without it, only the `admin` role passes (any check, any resource), regardless of Casbin policy. Community/Pro effectively get one implicit admin role; multi-role RBAC (viewer/operator/custom) requires Enterprise.
- **Webhook HMAC authentication** for `POST /webhooks/stacks/{id}` (public route, used by CI/CD). Previously accepted any request with a valid sequential integer ID — no secret. Now requires `X-Webhook-Signature: sha256=<hex HMAC-SHA256 of the raw body>` computed with a per-stack secret (`Stack.WebhookSecret`, generated on `CreateStack`, shown once, regenerable via new `POST /stacks/{id}/webhook-secret`). Split the old dual-purpose handler: `WebhookDeploy` (public, HMAC-required) vs `DeployStack` (authenticated dashboard "Deploy" button, no HMAC — already behind JWT + RBAC + the `stacks` feature).
- **Server refuses to boot** with a default/placeholder `SECRET_KEY` or `MASTER_API_KEY` (`your-secret-key-here`, `change-me-in-production`, etc.) instead of only logging a warning. Compose files now require these via `${VAR:?...}`; the systemd packaging postinstall script auto-generates real random secrets into `/etc/conman/server.env` on first install.
- **Stack name allowlist validation** (`^[a-z0-9][a-z0-9_-]{0,62}$`, `service.ValidateStackName`) closes a path-traversal hole — `stack.Name` was joined unvalidated into a filesystem path (`filepath.Join(dataDir, stack.Name)`) that a compose file then got written to and executed.
- Bounded HTTP client timeouts on the agent reverse-proxy paths (30s shared client, 15s file-listing) — both previously used `http.Client{}`/`http.Get` with no timeout at all.
- Request body size limits: `api.ReadJSON` now caps at 10 MiB by default; the 4 unauthenticated-by-PSK-only agent endpoints (`register`, `heartbeat`, `report`, `events`) use explicit per-endpoint limits (1 MiB, except `report` at 25 MiB for full host inventory payloads).
- Fixed 3 unguarded `id[:8]` slices (agents.go event logging, alert evaluator's offline-agent message, agent's own ID-based name fallback) that panicked on any ID shorter than 8 characters — the alert evaluator one ran in an unrecovered goroutine, so it could permanently kill the alerting loop.
- `RevokeAPIKey` was an empty function body (`TODO: Parse ID from URL and delete`) — implemented, scoped so a user can only revoke their own keys.
- API key expiry (`ExpiresAt`) is now actually enforced in `AuthMiddleware` (was stored but never checked); added `LastUsedAt` tracking on successful auth.
- `User.Password`, `APIKey.Key`, and `Stack.WebhookSecret` are no longer serialized in any API response (`json:"-"`) — each is shown in full exactly once, at creation, via a dedicated response wrapper; every other read only ever sees a short prefix or nothing.
- Fixed `internal/authz.InitCasbin` loading `model.conf` via a relative path (`"internal/authz/model.conf"`) that only resolved when the process's cwd happened to be the repo root — broke under `go test` and would have broken any packaged binary launched from elsewhere. Now embedded into the binary at build time (`//go:embed`).

### Added

- New `api` license feature (Pro+Enterprise) gating `/profile/keys/*` (self-service API key management).
- `/activities` (audit log) now gated behind the existing Enterprise-only `audit_logs` feature — previously ungated despite being sold as an Enterprise perk.
- Unit tests for `internal/middleware`, `internal/authz`, and `internal/license` (previously zero coverage) — covers the RBAC license gate, Casbin bootstrap policy matrix, `AgentAuthMiddleware`, master key / API key (incl. expiry) / JWT auth paths, and tier → feature mapping.
- `.github/workflows/ci.yml` — backend + agent (`go vet` + `go test`) and frontend (`tsc --noEmit` + `vitest run`) on every push/PR to `main`. Previously no CI existed at all.

### Changed

- Images and Containers pages are now full-width (previously capped at `max-w-[1600px]`); their Name/Actions columns stay fixed (`position: sticky`) while the rest of the table scrolls horizontally.

### Removed

- Root `Dockerfile`, `config.yaml`, `scripts/setup.sh` — leftovers from a pre-Go Python predecessor; `Dockerfile` referenced a `requirements.txt`/`src/` that no longer exist and could not build.
- `docker-compose.yml` — stale and broken (wrong ports, agent had no auth token so it couldn't connect), and was what bare `docker compose up` picked with no `-f` flag. `docker-compose.simple.yml` is the only compose file now.
- `zitadel-config.yaml` and the Zitadel/Kong-with-Postgres services in the removed `docker-compose.yml` — dead experiment with zero integration code anywhere in the repo (auth is JWT + Casbin, unrelated to Zitadel).
- `frontend/src/modules/LogExplorer/` — ~550 lines with zero references from any route or import.

### Fixed

- Removed Claude AI co-authorship trailers from git history (16 commits) via `git filter-repo`.

## [Unreleased] - 2026-04-12

### Added (Licensing System — Keygen.sh)

#### Backend
- **`backend/internal/models/license.go`** — `LicenseCache` GORM model (single-row singleton); stores tier, validity, expiry, max hosts, features JSON, machine ID, grace period end
- **`backend/internal/license/service.go`** — `LicenseService` with in-memory `LicenseState`, direct HTTP calls to Keygen.sh REST API, machine activation/deactivation, 72-hour grace period on network failure, background re-validation every 6 hours
- **`backend/internal/license/fingerprint.go`** — Deterministic machine fingerprint (SHA256 of hostname + MAC address)
- **`backend/internal/api/license.go`** — License REST endpoints: `GET /license`, `POST /license/activate`, `POST /license/deactivate`, `POST /license/validate`
- **`backend/internal/middleware/license.go`** — `RequireFeature(feature)` middleware; returns `403` with `{"license_required": true, "feature": "..."}` when feature not available on current tier
- License middleware injected into all protected routes; Stacks and Alerts routes wrapped with `RequireFeature("stacks")` / `RequireFeature("alerts")`
- Host limit enforced in `AgentHandler.Register()`: returns `403` if `License.CanAddHost()` is false
- `LicenseCache` added to AutoMigrate in `main.go`
- Three env vars: `LICENSE_KEY`, `KEYGEN_ACCOUNT_ID`, `KEYGEN_PRODUCT_ID` (offline Pro fallback if account ID not set)

#### Frontend
- **`frontend/src/types/license.ts`** — `LicenseTier`, `LicenseInfo` interface, `TIER_LABELS`, `TIER_COLORS`, `FEATURE_LABELS`, `ALL_FEATURES` constants
- **`frontend/src/contexts/LicenseContext.tsx`** — `LicenseProvider` context; fetches `/api/v1/license` on mount, re-fetches every 30 minutes; exposes `license`, `loading`, `hasFeature()`, `isProOrAbove`, `isEnterprise`, `activateLicense()`, `deactivateLicense()`, `refreshLicense()`
- **`frontend/src/components/settings/LicenseSettings.tsx`** — License tab in Settings: current plan card, host usage progress bar, feature availability checklist, key input with Activate/Deactivate, grace period warning, force re-validate button
- **`frontend/src/components/ui/UpgradePrompt.tsx`** — Reusable gate component shown when accessing a feature not available on current tier; links to Settings > License
- Tier badge (Community / Pro / Enterprise) shown at bottom of sidebar
- Lock icon on Stacks nav link when `stacks` feature is unavailable
- Grace period warning banner in `DashboardLayout` above main content when license is offline
- `api.ts` interceptor tags 403 responses with `license_required: true` as `error.isLicenseError` for UI upgrade prompts
- `App.tsx` wraps `HostProvider` with `LicenseProvider`
- Settings page adds License tab with `ShieldCheckIcon`

#### Tier Structure

| | Community (Free) | Pro | Enterprise |
|---|---|---|---|
| Max hosts | 1 | 10 | Unlimited |
| Stacks | — | Yes | Yes |
| Alerts | — | Yes | Yes |
| Multi-host | — | Yes | Yes |
| Update checking | — | Yes | Yes |
| RBAC / SSO | — | — | Yes |
| Audit logs | — | — | Yes |

No `LICENSE_KEY` = Community tier (single-host, fully functional). Never crashes on license validation failure.

### Added (Image Status Display)
- Images page now shows a **used / unused** status badge on each image card
- Backend `GetAgentImages()` cross-references image IDs and repo tags against the active container list to compute `status: "used" | "unused"`
- `AgentImageResponse` struct in `agents.go` extends `protocol.Image` with `Status` and `UpdateAvailable` fields; `protocol.Image` itself unchanged

### Fixed (Container Resource Metrics)
- CPU%, memory, disk I/O, network Rx/Tx were blank on the Containers page for agent-managed hosts
- `GetAgentContainers()` now merges `agent.Metrics[containerID]` into each container response (`AgentContainerResponse` struct)
- `formatMetricBytes()` helper formats `uint64` byte values to human-readable strings (KB/MB/GB)

---

## [Unreleased] - 2026-04-08

### Added (Linux Packaging)
- `.deb` and `.rpm` packages for both server and agent via nfpm
- Systemd service files: `conman-server.service`, `conman-agent.service`
- Environment config files: `/etc/conman/server.env`, `/etc/conman-agent/agent.env`
- Pre/post install scripts (user creation, service enable, directory permissions)
- Build script: `packaging/build-packages.sh` for one-command package generation

### Added (Documentation)
- `docs/INSTALLATION.md` -- Complete installation guide for packages, Docker, and source builds
- `docs/CONFIGURATION.md` -- Full environment variable reference for server and agent
- `docs/API.md` -- Complete REST API reference with request/response examples

### Added (Native containerd Support)

#### ContainerdProvider
- New `agent/internal/runtime/containerd.go` — full `ContainerRuntime` implementation for containerd
- Connects via gRPC to `/run/containerd/containerd.sock` with namespace support (`CONTAINERD_NAMESPACE`)
- Full support: Ping, Info, ListContainers, InspectContainer, RemoveContainer, ListImages, PullImage, RemoveImage, WatchEvents
- Stub support: Networks (returns empty — containerd uses CNI), Volumes, Logs/Exec/Stats streaming (ErrNotSupported)
- Best-effort compose via `nerdctl compose` if available in PATH

#### Runtime Auto-Detection
- Agent auto-detects available runtime when `RUNTIME_TYPE=auto` (new default)
- Detection order: Docker socket -> Podman socket -> containerd socket -> fallback Docker
- `CONTAINERD_NAMESPACE` env var for selecting containerd namespace (default "default")

#### Extended ContainerRuntime Interface
- Added 12 new methods: ContainerStart/Stop/Restart, ContainerLogs, ContainerStatsStream, ExecInteractive, ListContainerFiles, DownloadContainerFile, SystemDiskUsage, CreateNetwork, DuplicateNetwork, WatchEvents
- Added supporting types: LogsOptions, ExecSession, FileEntry, DiskUsage
- Added `ErrNotSupported` sentinel error for graceful degradation
- Docker and Podman providers implement all new methods

#### Protocol Changes
- `HostInfo` now has `runtime_type`, `runtime_version`, `runtime_root_dir`, `namespace` fields
- `AgentRegistration` includes `runtime_type` for backend tracking
- `DockerVersion`/`DockerRootDir` kept as deprecated backward-compat aliases

#### Backend
- `Agent` model has new `RuntimeType` field (auto-migrated)
- `AgentState` includes `RuntimeType` in API responses
- `GET /agents?runtime=containerd` filter support
- Registration stores and serves runtime type

#### Frontend
- Runtime selector buttons (Docker / Podman / Containerd) in AddHostModal
- Containerd shows binary download + systemd service install commands (no Docker required)
- Runtime badge on Hosts page with color-coded styling (blue=Docker, purple=Podman, amber=Containerd)
- System info shows "Runtime" instead of "Docker Version"
- HostContext types updated with runtime fields

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
