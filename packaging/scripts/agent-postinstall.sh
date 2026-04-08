#!/bin/sh
set -e

# Reload systemd and enable service
systemctl daemon-reload
systemctl enable conman-agent.service

echo ""
echo "Conman Agent installed successfully!"
echo ""
echo "  1. Edit configuration: /etc/conman-agent/agent.env"
echo "     (set CONMAN_SERVER_URL and CONMAN_SERVER_TOKEN)"
echo "  2. Start the service:  systemctl start conman-agent"
echo ""
echo "  Runtime auto-detection is enabled by default."
echo "  Supported: Docker, Podman, containerd"
echo ""
