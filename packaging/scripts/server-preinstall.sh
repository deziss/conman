#!/bin/sh
set -e

# Create conman system user if it doesn't exist
if ! id -u conman >/dev/null 2>&1; then
    useradd --system --home-dir /var/lib/conman --shell /usr/sbin/nologin --comment "Conman Server" conman
fi

# Add conman user to docker group if it exists
if getent group docker >/dev/null 2>&1; then
    usermod -aG docker conman
fi
