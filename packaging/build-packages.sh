#!/bin/bash
set -euo pipefail

# Build Conman .deb and .rpm packages
# Prerequisites: go 1.24+, node 20+, nfpm (go install github.com/goreleaser/nfpm/v2/cmd/nfpm@latest)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VERSION="${VERSION:-1.0.0}"
DIST_DIR="$PROJECT_DIR/dist"

echo "=== Building Conman packages v${VERSION} ==="
echo ""

# Clean
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# 1. Build frontend
echo "--- Building frontend ---"
cd "$PROJECT_DIR/frontend"
npm install --legacy-peer-deps 2>/dev/null
npm run build
echo "Frontend built: $(du -sh dist | cut -f1)"

# 2. Build backend (with CGO for SQLite)
echo "--- Building conman-server ---"
cd "$PROJECT_DIR/backend"
CGO_ENABLED=1 GOOS=linux go build \
    -ldflags="-s -w -X main.version=${VERSION}" \
    -trimpath \
    -o "$DIST_DIR/conman-server" \
    ./cmd/server
echo "Server binary: $(du -sh "$DIST_DIR/conman-server" | cut -f1)"

# 3. Build agent (no CGO needed)
echo "--- Building conman-agent ---"
cd "$PROJECT_DIR/agent"
CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w -X main.version=${VERSION}" \
    -trimpath \
    -o "$DIST_DIR/conman-agent" \
    ./cmd/agent
echo "Agent binary: $(du -sh "$DIST_DIR/conman-agent" | cut -f1)"

# 4. Check for nfpm
if ! command -v nfpm &>/dev/null; then
    echo ""
    echo "nfpm not found. Installing..."
    go install github.com/goreleaser/nfpm/v2/cmd/nfpm@latest
fi

cd "$PROJECT_DIR"

# 5. Build server packages
echo ""
echo "--- Building conman-server packages ---"
VERSION="$VERSION" nfpm package --config packaging/nfpm-server.yaml --packager deb --target "$DIST_DIR/"
VERSION="$VERSION" nfpm package --config packaging/nfpm-server.yaml --packager rpm --target "$DIST_DIR/"

# 6. Build agent packages
echo "--- Building conman-agent packages ---"
VERSION="$VERSION" nfpm package --config packaging/nfpm-agent.yaml --packager deb --target "$DIST_DIR/"
VERSION="$VERSION" nfpm package --config packaging/nfpm-agent.yaml --packager rpm --target "$DIST_DIR/"

echo ""
echo "=== Build complete ==="
echo ""
ls -lh "$DIST_DIR/"*.{deb,rpm} 2>/dev/null
echo ""
echo "Install on Debian/Ubuntu:"
echo "  sudo dpkg -i dist/conman-server_${VERSION}_amd64.deb"
echo "  sudo dpkg -i dist/conman-agent_${VERSION}_amd64.deb"
echo ""
echo "Install on RHEL/Fedora:"
echo "  sudo rpm -i dist/conman-server-${VERSION}.x86_64.rpm"
echo "  sudo rpm -i dist/conman-agent-${VERSION}.x86_64.rpm"
