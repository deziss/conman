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

Conman uses [Keygen.sh](https://keygen.sh) for license management. The integration lives in `backend/internal/license/`.

### Tiers

| Tier | Max Hosts | Feature Codes |
|---|---|---|
| `community` | 1 | (none — containers/images only) |
| `pro` | 10 | `stacks`, `alerts`, `multi_host`, `update_check` |
| `enterprise` | unlimited | all pro features + `rbac`, `sso`, `audit_logs` |

No license key = Community tier. The system **never blocks startup** on validation failure.

### Backend Components

- `internal/models/license.go` — `LicenseCache` DB model (singleton row, ID=1)
- `internal/license/service.go` — `LicenseService`: validates key via Keygen.sh HTTP API, manages in-memory `LicenseState`, 72h grace period on network failure, re-validates every 6h
- `internal/license/fingerprint.go` — machine fingerprint (SHA256 of hostname + MAC)
- `internal/api/license.go` — REST endpoints: `GET /license`, `POST /license/activate|deactivate|validate`
- `internal/middleware/license.go` — `RequireFeature(code)` middleware; returns `403 {"license_required":true}` when feature unavailable

### Wiring in main.go

```go
licenseService := license.NewLicenseService(db)
go licenseService.Start(ctx)
agentHandler := api.NewAgentHandler(db, metricsStore, licenseService)
// Protected routes:
r.Use(middleware.NewLicenseMiddleware(licenseService))
// Feature-gated route groups:
r.Group(func(r chi.Router) {
    r.Use(middleware.RequireFeature("stacks"))
    // stacks routes...
})
```

### Configuration

```bash
LICENSE_KEY=         # Keygen.sh license key (empty = Community)
KEYGEN_ACCOUNT_ID=   # Keygen.sh account ID (empty = offline Pro fallback)
KEYGEN_PRODUCT_ID=   # Keygen.sh product ID
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
- The `docker-compose.simple.yml` is the primary dev compose file (unified server + agent).
- Default admin credentials: `admin@example.com` / `admin` (configurable via env vars).

## Testing

```bash
# Backend
cd backend && go test ./...

# Frontend
cd frontend && npm test

# API smoke test
curl -s http://localhost:5173/api/v1/health
```

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
