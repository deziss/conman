# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install git for go mod
RUN apk add --no-cache git ca-certificates

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build with optimizations
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o conman-agent ./cmd/agent

# Final stage - minimal image with shell
FROM alpine:latest

# Install dependencies for shell and network tools, and Docker CLI/Compose
RUN apk add --no-cache ca-certificates curl bash iproute2 docker-cli docker-cli-compose

# Copy the binary

# Copy the binary
COPY --from=builder /app/conman-agent /conman-agent

# Expose scrape port
EXPOSE 5073

# Run the agent
ENTRYPOINT ["/conman-agent"]
