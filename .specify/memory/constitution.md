# Conman: Multi-Host Container Management Platform Constitution

Conman is a platform for managing and monitoring containers across multiple hosts. It provides a web dashboard, REST API, real-time metrics, alerting, and remote container control via lightweight agents. Supports **Docker**, **Podman**, and **containerd** natively -- no Docker in

## Core Principles

### I. Clarity Over Cleverness
Code should be readable by the next maintainer. Optimize for understanding first;
optimize for performance only when measurements demand it. Names carry intent;
abbreviations are earned, not assumed.

### II. Test-Backed Changes
Any behavior change ships with a test that would have caught its absence. Bug
fixes start with a failing reproduction; features start with the test that
defines "done." Tests run in CI via `pytest`.

### III. Boundaries Are Contracts
Module, service, and library boundaries are contracts. Changes that cross
boundaries require explicit review. Avoid leaking internal types across
boundaries; prefer narrow, documented interfaces.

### IV. Reproducible Builds
Local, CI, and production builds produce equivalent artifacts. Pin dependency
versions; do not rely on "latest." Container images and orchestration manifests are reviewed alongside code changes.

### V. Honest Operations
Logs explain what happened, not what the developer hoped. Errors surface
with enough context to debug without re-running. Secrets never enter source
control, logs, or container layers.

## Technology Stack

- Primary language(s): Go, TypeScript, Shell
- Containerized: Docker / docker-compose
- Primary language for new code: Go.
- New dependencies require justification: what problem, what alternatives, what cost.

## Development Workflow

- Tests must pass locally before pushing: `pytest`.
- Changes that touch shared modules require explicit review.
- Container builds must succeed before merge; never commit secrets to image layers.
- Commits are scoped, with messages that describe *why*, not just *what*.
- Public-facing APIs follow semver; breaking changes get an explicit major bump and migration notes.

## Governance

This constitution supersedes ad-hoc practice. Amendments are made by PR,
with a one-line rationale in the commit message. When a principle here
conflicts with an external requirement (security, compliance), the external
requirement wins — document the exception in the PR.

**Version**: 1.0.0 | **Ratified**: 2026-05-23 | **Last Amended**: 2026-05-23
