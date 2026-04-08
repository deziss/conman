#!/bin/sh
set -e

# Stop and disable service
systemctl stop conman-agent.service 2>/dev/null || true
systemctl disable conman-agent.service 2>/dev/null || true
