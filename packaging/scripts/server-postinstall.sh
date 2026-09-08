#!/bin/sh
set -e

ENV_FILE=/etc/conman/server.env

# Generate real secrets on first install — the shipped server.env ships with
# the literal placeholder "change-me-in-production" for both SECRET_KEY and
# MASTER_API_KEY, and the server refuses to boot with either value set.
# Package config files are marked noreplace, so this only runs once: on
# upgrades the admin's already-customized env file is left untouched.
if [ -f "$ENV_FILE" ] && grep -q "^SECRET_KEY=change-me-in-production$" "$ENV_FILE" 2>/dev/null; then
    if command -v openssl >/dev/null 2>&1; then
        RAND_SECRET_KEY=$(openssl rand -hex 32)
        RAND_MASTER_KEY=$(openssl rand -hex 32)
    else
        RAND_SECRET_KEY=$(head -c32 /dev/urandom | od -An -tx1 | tr -d ' \n')
        RAND_MASTER_KEY=$(head -c32 /dev/urandom | od -An -tx1 | tr -d ' \n')
    fi
    sed -i "s/^SECRET_KEY=change-me-in-production$/SECRET_KEY=${RAND_SECRET_KEY}/" "$ENV_FILE"
    sed -i "s/^MASTER_API_KEY=change-me-in-production$/MASTER_API_KEY=${RAND_MASTER_KEY}/" "$ENV_FILE"
    chmod 640 "$ENV_FILE"
fi

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
