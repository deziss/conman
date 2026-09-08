# Conman - Multi-Host Container Management Platform

## Project Overview

Conman is a web-based container management platform for monitoring and managing Docker/Podman/containerd containers across multiple hosts. It consists of three components:

- **Backend** (`backend/`) - Go REST API server (Chi router, GORM, SQLite/PostgreSQL)
- **Agent** (`agent/`) - Lightweight Go binary deployed on each monitored host
- **Frontend** (`frontend/`) - React 19 SPA (TypeScript, Vite, Tailwind CSS)

## Build & Run

```bash
# Full stack (docker compose)
docker compose -f docker-compose.simple.yml up --build -d

# Backend only
cd backend && go build -o conman-server ./cmd/server

# Agent only
cd agent && CGO_ENABLED=0 go build -o conman-agent ./cmd/agent

# Frontend dev
cd frontend && npm install --legacy-peer-deps && npm run dev

# Frontend build
cd frontend && npm run build
```

## Architecture

### Data Flow
```
Container Runtime (Docker/Podman/containerd)
    -> Agent (collects containers, images, metrics, networks, volumes)
    -> Backend (receives reports via WebSocket, stores in AgentState)
    -> Frontend (fetches from /api/v1/agents/{id}/*)
```

### Key Pattern: Agent-Based Endpoints
The frontend primarily uses agent-based API endpoints (`/api/v1/agents/{id}/...`), NOT the local Docker endpoints (`/api/v1/docker/...`). When adding features that need computed/enriched data:
- The agent sends raw `protocol.*` types via reports
- The backend `GetAgent*` handlers in `agents.go` must transform/enrich data before returning to the frontend
- See `GetAgentImages` and `GetAgentContainers` for examples of merging metrics and computing status

### Authentication
- JWT-based auth via `POST /api/v1/auth/login` with `{"username": "...", "password": "..."}`
- Agent auth via PSK token (`X-Agent-Token` header)
- RBAC via Casbin (`internal/authz/`)

## Project Structure

### Backend (`backend/`)
- `cmd/server/main.go` - Entry point, route registration
- `internal/api/agents.go` - Agent management, container/image endpoints with enrichment
- `internal/api/containers.go` - Local Docker container operations
- `internal/api/docker.go` - Local Docker image/system operations
- `internal/api/auth.go` - Authentication
- `internal/models/models.go` - Response models for local Docker endpoints
- `internal/service/stats_collector.go` - Local container stats collection
- `internal/service/registry.go` - Image update checking
- `internal/middleware/` - Auth, RBAC middleware
- `internal/config/` - App configuration
- `internal/metrics/` - Metrics storage (time-series)
- `pkg/protocol/types.go` - Shared types between agent and backend (Container, Image, ContainerMetrics, etc.)

### Agent (`agent/`)
- `cmd/agent/` - Entry point
- `internal/agent/api.go` - Agent HTTP API handlers
- `internal/agent/collector.go` - Collects containers, images, networks, volumes from runtime
- `internal/runtime/runtime.go` - Runtime interface (abstraction over Docker/Podman/containerd)
- `internal/runtime/docker.go` - Docker/Podman implementation

### Frontend (`frontend/`)
- `src/pages/` - Page components (Containers, Images, Networks, Volumes, Stacks, Dashboard, etc.)
- `src/components/` - Reusable components (InspectModal, Terminal, FileBrowser, etc.)
- `src/contexts/` - React contexts (Auth, Host, Theme, Settings, Cache)
- `src/services/api.ts` - Axios HTTP client
- `src/layouts/DashboardLayout.tsx` - Main layout with sidebar

## Licensing System

Conman validates licenses against **Licencia** (a self-hosted licensing server — see `LICENCIA_URL`/`LICENCIA_API_KEY`), not Keygen.sh. The integration lives in `backend/internal/license/`.

### Tiers

| Tier | Max Hosts | Feature Codes |
|---|---|---|
| `community` | 1 | `alerts` |
| `pro` | 10 | `stacks`, `alerts`, `multi_host`, `update_check`, `api` |
| `enterprise` | unlimited | all pro features + `rbac`, `sso`, `audit_logs` |

No license key = Community tier. If `LICENCIA_URL` is empty, any non-empty `LICENSE_KEY` is treated as Pro (offline fallback). The system **never blocks startup** on validation failure — see `DefaultFeatures`/`DefaultMaxHosts` in `internal/models/license.go` for the exact tier → feature mapping (also covered by `internal/license/service_test.go`).

Two different feature-gating patterns are in play:

- **Route-level features** (`stacks`, `audit_logs`, `api`) use `middleware.RequireFeature(code)` wrapping a whole route group — 403 with `{"license_required":true,"feature":"..."}` when unavailable.
- **`rbac` is enforced inline inside `middleware.RequirePermission`**, not via `RequireFeature`. Without the `rbac` feature, `RequirePermission` only lets the `admin` role through (regardless of Casbin policy) — Community/Pro effectively have a single implicit admin role, and multi-role RBAC (viewer/operator/custom) only activates on Enterprise. See `internal/middleware/auth_test.go`.
- `sso` has no gated code yet — no OIDC/SSO integration exists in this repo. When it's built, gate it with `middleware.RequireFeature("sso")` the same way `stacks` is gated today.

### Backend Components

- `internal/models/license.go` — `LicenseCache` DB model (singleton row, ID=1); `DefaultFeatures`/`DefaultMaxHosts` tier mapping
- `internal/license/service.go` — `LicenseService`: validates key via Licencia's `POST /api/v1/licenses/validate` (header `x-api-key: $LICENCIA_API_KEY`), manages in-memory `LicenseState`, 72h grace period on network failure, re-validates every 6h
- `internal/license/fingerprint.go` — machine fingerprint (SHA256 of hostname + MAC)
- `internal/api/license.go` — REST endpoints: `GET /license`, `POST /license/activate|deactivate|validate`
- `internal/middleware/license.go` — `RequireFeature(code)` middleware; returns `403 {"license_required":true}` when feature unavailable
- `internal/middleware/auth.go` — `RequirePermission(obj, act)` — Casbin RBAC check gated by the `rbac` license feature (see above)

### Wiring in main.go

```go
licenseService := license.NewLicenseService(db)
go licenseService.Start(ctx)
agentHandler := api.NewAgentHandler(db, metricsStore, licenseService, activityService)
// Protected routes:
r.Use(middleware.NewLicenseMiddleware(licenseService))
// Feature-gated route groups:
r.Group(func(r chi.Router) {
    r.Use(middleware.RequireFeature("stacks"))
    // stacks routes...
})
r.Route("/activities", func(r chi.Router) {
    r.Use(middleware.RequireFeature("audit_logs"))
    // activity log routes...
})
r.Route("/profile/keys", func(r chi.Router) {
    r.Use(middleware.RequireFeature("api"))
    // self-service API key routes...
})
```

### Configuration

```bash
LICENSE_KEY=         # Licencia license key (empty = Community)
LICENCIA_URL=        # Self-hosted Licencia server URL (empty = offline fallback: any key = Pro)
LICENCIA_API_KEY=    # API key with license:validate scope on the Licencia server
```

### Frontend

- `src/types/license.ts` — `LicenseTier`, `LicenseInfo`, tier/feature label maps
- `src/contexts/LicenseContext.tsx` — `useLicense()` hook: `hasFeature()`, `isProOrAbove`, `activateLicense()`, etc.
- `src/components/settings/LicenseSettings.tsx` — Settings > License tab
- `src/components/ui/UpgradePrompt.tsx` — Gate component for feature pages
- Feature-gated pages: `if (!hasFeature('stacks')) return <UpgradePrompt />`

## Important Conventions

- `protocol.*` types in `pkg/protocol/types.go` are the wire format between agent and backend. Do not add computed fields (like `status`) to them.
- Create response structs (e.g., `AgentImageResponse`, `AgentContainerResponse`) in `agents.go` for enriched API responses.
- Frontend expects specific JSON field names - check the TypeScript interfaces in page components before modifying backend responses.
- The `docker-compose.simple.yml` is the primary (and only) compose file — `docker-compose.yml` was removed (stale, pointed at the wrong ports, and was what `docker compose up` picked with no `-f` flag). Use `.scaled.yml` for the Postgres + Kong horizontal-scaling setup.
- Default admin credentials: `admin@example.com` / `admin` (configurable via `ADMIN_EMAIL`/`ADMIN_PASSWORD`; re-applied on every server restart).
- `SECRET_KEY` and `MASTER_API_KEY` have **no usable default** — the server calls `log.Fatal` at boot if either is unset or a known placeholder value (`your-secret-key-here`, `change-me-in-production`, etc. — see `internal/config/config.go`). Compose files require them via `${VAR:?...}`; the systemd package auto-generates real random values into `/etc/conman/server.env` on first install.
- `POST /auth/login` takes `{"username": "...", "password": "..."}` (the `username` field holds the user's email) and returns `{"access_token": "...", "token_type": "bearer"}` — no `user` object in the response, no refresh token.
- Casbin's `internal/authz/model.conf` is embedded into the binary at build time (`//go:embed`) — it is not read from disk at runtime, so the server no longer needs to be launched from the repo root for RBAC to work.

## Testing

```bash
# Backend (unit tests cover middleware/authz/license, RBAC + license gating, Casbin bootstrap policy)
cd backend && go vet ./... && go test ./...

# Agent
cd agent && go vet ./... && go test ./...

# Frontend
cd frontend && npx tsc --noEmit && npm test   # npm test runs `vitest run`

# API smoke test
curl -s http://localhost:5173/api/v1/health
```

CI (`.github/workflows/ci.yml`) runs all of the above — backend/agent (`go vet` + `go test`) and frontend (`tsc --noEmit` + `vitest run`) — on every push/PR to `main`.

