#!/bin/sh
set -e

# Fix ownership
chown -R conman:conman /var/lib/conman /var/log/conman 2>/dev/null || true

# Reload systemd and enable service
systemctl daemon-reload
systemctl enable conman-server.service

echo ""
echo "Conman Server installed successfully!"
echo ""
echo "  1. Edit configuration: /etc/conman/server.env"
echo "  2. Start the service:  systemctl start conman-server"
echo "  3. Open dashboard:     http://localhost:5173"
echo ""
