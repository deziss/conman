#!/bin/sh
set -e

# Stop and disable service
systemctl stop conman-server.service 2>/dev/null || true
systemctl disable conman-server.service 2>/dev/null || true
