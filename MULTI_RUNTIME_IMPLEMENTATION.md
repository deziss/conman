# Multi-Runtime Support Implementation Progress

## Overview
This document tracks the implementation of multi-runtime support (Docker and Podman) for the Conman project.

## Completed Tasks

### 1. Runtime Abstraction Layer ✅
- **Interface Definition**: Created `ContainerRuntime` interface in `agent/internal/runtime/runtime.go`
- **Docker Provider**: Implemented `DockerProvider` in `agent/internal/runtime/docker.go`
  - Full implementation of all interface methods
  - Uses official Docker Go SDK
  - Supports container, image, network, and volume operations
- **Podman Provider**: Implemented `PodmanProvider` in `agent/internal/runtime/podman.go`
  - **API Mode**: Uses Docker-compatible REST API when socket is available
  - **CLI Mode**: Falls back to `podman` binary for rootless environments
  - Implements all interface methods with CLI fallback

### 2. Agent Integration ✅
- **Configuration Update**: Added runtime-specific environment variables:
  - `RUNTIME_TYPE`: "docker" or "podman"
  - `RUNTIME_SOCKET_PATH`: Path to socket (e.g., `/run/user/1000/podman/podman.sock`)
  - `RUNTIME_USE_CLI`: Boolean flag for CLI fallback
- **Agent Initialization**: Updated `agent/internal/agent/agent.go` to use `RuntimeFactory`
- **Collector Refactoring**: Refactored all collection methods to use the runtime interface

### 3. Backend Schema Update ✅
- **Database Schema**: Updated `arcane-db-schema.md` to include:
  - `runtime_type`: TEXT field (default: 'docker')
  - `runtime_socket_path`: TEXT field
  - `runtime_version`: TEXT field

### 4. Rootless Podman Support ✅
- **Port Validation**: Implemented `ValidateRootlessPort()` in `agent/internal/runtime/validate.go`
  - Checks for privileged ports (< 1024) in rootless mode
  - Validates compose file port mappings
- **Error Handling**: Returns clear error messages for rootless limitations

### 5. Compose Wrapper ✅
- **Docker Compose**: Implemented `ApplyCompose()` and `RemoveStack()` for Docker
- **Podman Compose**: Implemented `ApplyCompose()` and `RemoveStack()` for Podman
  - Uses temporary files for compose configuration
  - Proper error handling with output capture

### 6. Testing Foundation ✅
- **Unit Tests**: Created `agent/internal/runtime/runtime_test.go`
  - Provider initialization tests
  - Runtime factory tests
  - Port validation tests

## In Progress

### 9. Comprehensive Test Suite
- **Status**: In Progress
- **Plan**:
  - Integration tests for Docker provider
  - Integration tests for Podman provider (API and CLI modes)
  - End-to-end tests for compose operations
  - Load tests for collection performance

## Completed Tasks (Summary)

### 1-8. (See previous sections)

### 9. Structured Logging & Retry Policies ✅
- **Structured Logging**: Created `agent/internal/log/log.go`
  - JSON-formatted log entries with correlation IDs
  - Log levels: DEBUG, INFO, WARN, ERROR
  - Context-aware logging with operation and error tracking
  - Global and per-instance loggers
- **Retry Logic**: Created `agent/internal/retry/retry.go`
  - Exponential backoff with configurable parameters
  - Support for both void and result-returning functions
  - Context-aware timeout handling
  - Retryable error detection for common network failures

### 10. Comprehensive Test Suite
- **Status**: In Progress
- **Plan**:
  - Integration tests for Docker provider
  - Integration tests for Podman provider (API and CLI modes)
  - End-to-end tests for compose operations
  - Load tests for collection performance

## Environment Variables Reference

### Agent Configuration
```bash
# Runtime Selection
RUNTIME_TYPE=docker|podman
RUNTIME_SOCKET_PATH=/var/run/docker.sock|/run/user/1000/podman/podman.sock
RUNTIME_USE_CLI=false|true

# Existing settings (unchanged)
CONMAN_SERVER_URL=http://localhost:8080
CONMAN_SERVER_TOKEN=your-token
AGENT_MODE=push|scrape|hybrid
```

## Migration Guide

### From Docker-only to Multi-Runtime

1. **Update Agent Configuration**:
   ```bash
   # For Docker (default, no change needed)
   RUNTIME_TYPE=docker
   RUNTIME_SOCKET_PATH=/var/run/docker.sock
   
   # For Podman (API mode)
   RUNTIME_TYPE=podman
   RUNTIME_SOCKET_PATH=/run/user/1000/podman/podman.sock
   RUNTIME_USE_CLI=false
   
   # For Podman (CLI mode, rootless)
   RUNTIME_TYPE=podman
   RUNTIME_USE_CLI=true
   ```

2. **Update Backend Database**:
   - Run migration to add `runtime_type`, `runtime_socket_path`, and `runtime_version` columns to `environments` table
   - Existing environments default to `docker`

3. **Verify Rootless Compatibility**:
   - Check compose files for privileged ports (< 1024)
   - Update port mappings if necessary

## Next Steps

1. **Run Tests**:
   - Run unit tests: `cd agent && go test ./...`
   - Run integration tests: `cd agent && RUN_INTEGRATION_TESTS=1 go test ./...`
   - Run benchmarks: `cd agent && go test -bench=. ./...`

2. **Enhance Logging** (Optional):
   - Add file-based logging with rotation
   - Improve correlation ID propagation across goroutines
   - Add log level configuration via environment variable

3. **Enhance Retry Logic** (Optional):
   - Add circuit breaker pattern
   - Add jitter to prevent thundering herd
   - Add metrics for retry attempts

4. **Documentation**:
   - Update README with multi-runtime setup instructions
   - Add troubleshooting guide for common Podman issues
   - Document rootless limitations and workarounds

## Known Limitations

1. **Rootless Podman**:
   - Cannot bind to ports < 1024 without special sysctl configuration
   - Some Docker Compose features may not be supported

2. **CLI Mode**:
   - Performance may be slower than API mode due to process spawning
   - Some advanced features may require API mode

3. **Testing**:
   - Integration tests require actual Docker/Podman environments
   - CLI mode testing requires `podman` binary in PATH

4. **Logging**:
   - Currently outputs to stdout; file rotation not yet implemented
   - Correlation ID propagation across goroutines needs enhancement

2. **CLI Mode**:
   - Performance may be slower than API mode due to process spawning
   - Some advanced features may require API mode

3. **Testing**:
   - Integration tests require actual Docker/Podman environments
   - CLI mode testing requires `podman` binary in PATH

## References

- [Podman Documentation](https://docs.podman.io/)
- [Docker Go SDK](https://pkg.go.dev/github.com/docker/docker/client)
- [Rootless Podman](https://docs.podman.io/en/latest/markdown/podman-rootless.1.html)
