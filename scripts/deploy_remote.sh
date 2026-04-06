#!/bin/bash
set -e

# Configuration
REMOTE_USER="user"
REMOTE_PASS="1234"
REMOTE_HOST="192.168.122.235"
IMAGE_NAME="conman-agent"
IMAGE_TAG="latest"
SERVER_URL="http://192.168.122.1:5173" # Assuming this is the host IP reachable from the VM

echo "🚀 Building Docker image for linux/amd64..."
# Build from the root context using the agent dockerfile
cd "$(dirname "$0")/.."
# Ensure we are building for the correct platform
docker build --platform linux/amd64 -t ${IMAGE_NAME}:${IMAGE_TAG} -f agent/Dockerfile agent/

echo "💾 Saving image to tarball..."
docker save ${IMAGE_NAME}:${IMAGE_TAG} | gzip > conman-agent.tar.gz

echo "📦 Transferring image to ${REMOTE_HOST}..."
sshpass -p "${REMOTE_PASS}" scp -o StrictHostKeyChecking=no conman-agent.tar.gz ${REMOTE_USER}@${REMOTE_HOST}:~/conman-agent.tar.gz

echo "🔄 Deploying on remote host..."
sshpass -p "${REMOTE_PASS}" ssh -o StrictHostKeyChecking=no ${REMOTE_USER}@${REMOTE_HOST} << EOF
  echo "📥 Loading image..."
  gunzip -c ~/conman-agent.tar.gz | docker load

  echo "🛑 Stopping existing container..."
  docker stop conman-agent || true
  docker rm conman-agent || true

  echo "🚀 Starting new container..."
  # Run with host networking or port mapping. Host networking is easiest for agent to reach docker socket and be reached if needed.
  # But for reverse proxying (agent connects to server), we just need outbound access.
  # Using host network to simplify accessing the docker socket.
  docker run -d \
    --name conman-agent \
    --restart unless-stopped \
    --network host \
    -v /var/run/docker.sock:/var/run/docker.sock:ro \
    -e AGENT_NAME=remote-worker-1 \
    -e AGENT_ID=c0c96319-4fda-486d-9c25-7c8c1ac94ba4 \
    -e CONMAN_SERVER_URL=${SERVER_URL} \
    -e AGENT_MODE=hybrid \
    -e COLLECT_INTERVAL=10s \
    -e SCRAPE_PORT=9091 \
    -e SCRAPE_ENABLED=true \
    -e ADVERTISED_ADDRESS=${REMOTE_HOST} \
    ${IMAGE_NAME}:${IMAGE_TAG}

  rm ~/conman-agent.tar.gz
EOF

rm conman-agent.tar.gz
echo "✅ Deployment complete!"
