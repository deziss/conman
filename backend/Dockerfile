FROM golang:1.24 AS builder

WORKDIR /app

# Install build dependencies (not needed on debian usually, but gcc is there)
# RUN apt-get update && apt-get install -y gcc

# Copy go mod files
COPY go.mod ./
# If go.sum exists, copy it, otherwise ignore (for initial setup)
COPY go.sum* ./

# Download dependencies
# We allow this to fail if go.sum is missing/invalid, as we can fix it in the next step
RUN go mod download || true

COPY . .

# Ensure dependencies are tidy and build
RUN go mod tidy
RUN go build -o main ./cmd/server

FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies for SQLite
RUN apt-get update && apt-get install -y sqlite3 ca-certificates curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/main .
COPY --from=builder /app/internal/config ./config
# Create data directory for sqlite
RUN mkdir -p /app/data

EXPOSE 8000

CMD ["./main"]
