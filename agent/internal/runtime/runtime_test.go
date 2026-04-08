package runtime

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestNewDockerProvider(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Test with default Docker socket
	provider, err := NewDockerProvider("unix:///var/run/docker.sock")
	if err != nil {
		t.Skipf("Docker not available: %v", err)
	}
	defer provider.Close()

	// Verify connection
	if err := provider.Ping(ctx); err != nil {
		t.Skipf("Docker not responding: %v", err)
	}

	t.Log("Docker provider initialized successfully")
}

func TestNewPodmanProvider(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Test with default Podman socket (user-specific)
	socketPath := os.Getenv("XDG_RUNTIME_DIR")
	if socketPath == "" {
		socketPath = "/run/user/1000"
	}
	socketPath = socketPath + "/podman/podman.sock"

	provider, err := NewPodmanProvider(socketPath, false)
	if err != nil {
		t.Skipf("Podman API not available: %v", err)
	}
	defer provider.Close()

	// Verify connection
	if err := provider.Ping(ctx); err != nil {
		t.Skipf("Podman not responding via API: %v", err)
	}

	t.Log("Podman provider initialized successfully (API mode)")
}

func TestRuntimeFactory(t *testing.T) {
	tests := []struct {
		name    string
		cfg     RuntimeConfig
		wantErr bool
	}{
		{
			name: "Docker runtime",
			cfg: RuntimeConfig{
				Type:       RuntimeDocker,
				SocketPath: "unix:///var/run/docker.sock",
				UseCLI:     false,
			},
			wantErr: false,
		},
		{
			name: "Podman runtime",
			cfg: RuntimeConfig{
				Type:       RuntimePodman,
				SocketPath: "/run/user/1000/podman/podman.sock",
				UseCLI:     false,
			},
			wantErr: false,
		},
		{
			name: "Invalid runtime",
			cfg: RuntimeConfig{
				Type:       "invalid",
				SocketPath: "",
				UseCLI:     false,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewRuntime(tt.cfg)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewRuntime() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestValidateRootlessPort(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	provider, err := NewPodmanProvider("", true)
	if err != nil {
		t.Skipf("Failed to create Podman CLI provider: %v", err)
	}
	defer provider.Close()

	tests := []struct {
		name    string
		port    int
		wantErr bool
	}{
		{"Valid port 8080", 8080, false},
		{"Valid port 443", 443, true}, // Should fail in rootless mode
		{"Valid port 80", 80, true},   // Should fail in rootless mode
		{"Valid port 8000", 8000, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := provider.ValidateRootlessPort(ctx, tt.port)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateRootlessPort() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
