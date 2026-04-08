package runtime

import (
	"context"
	"os"
	"testing"
	"time"
)

// TestDockerProviderIntegration tests Docker provider with real Docker daemon
func TestDockerProviderIntegration(t *testing.T) {
	if os.Getenv("RUN_INTEGRATION_TESTS") == "" {
		t.Skip("Skipping integration test: set RUN_INTEGRATION_TESTS=1 to run")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	provider, err := NewDockerProvider("unix:///var/run/docker.sock")
	if err != nil {
		t.Fatalf("Failed to create Docker provider: %v", err)
	}
	defer provider.Close()

	// Test Ping
	if err := provider.Ping(ctx); err != nil {
		t.Fatalf("Ping failed: %v", err)
	}

	// Test Info
	info, err := provider.Info(ctx)
	if err != nil {
		t.Fatalf("Info failed: %v", err)
	}
	if info.Hostname == "" {
		t.Error("Info returned empty hostname")
	}
	t.Logf("Docker Info: Host=%s, Version=%s", info.Hostname, info.DockerVersion)

	// Test ListContainers
	containers, err := provider.ListContainers(ctx, true)
	if err != nil {
		t.Fatalf("ListContainers failed: %v", err)
	}
	t.Logf("Found %d containers", len(containers))

	// Test ListImages
	images, err := provider.ListImages(ctx, true)
	if err != nil {
		t.Fatalf("ListImages failed: %v", err)
	}
	t.Logf("Found %d images", len(images))

	// Test ListNetworks
	networks, err := provider.ListNetworks(ctx)
	if err != nil {
		t.Fatalf("ListNetworks failed: %v", err)
	}
	t.Logf("Found %d networks", len(networks))

	// Test ListVolumes
	volumes, err := provider.ListVolumes(ctx)
	if err != nil {
		t.Fatalf("ListVolumes failed: %v", err)
	}
	t.Logf("Found %d volumes", len(volumes))
}

// TestPodmanProviderAPIIntegration tests Podman provider in API mode
func TestPodmanProviderAPIIntegration(t *testing.T) {
	if os.Getenv("RUN_INTEGRATION_TESTS") == "" {
		t.Skip("Skipping integration test: set RUN_INTEGRATION_TESTS=1 to run")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Try common Podman socket paths
	socketPaths := []string{
		"/run/user/1000/podman/podman.sock",
		"/run/user/1001/podman/podman.sock",
	}

	var provider *PodmanProvider
	var err error

	for _, socketPath := range socketPaths {
		if _, err := os.Stat(socketPath); err == nil {
			provider, err = NewPodmanProvider(socketPath, false)
			if err == nil {
				break
			}
		}
	}

	if provider == nil {
		t.Skipf("No Podman socket found, skipping test")
	}
	defer provider.Close()

	// Test Ping
	if err := provider.Ping(ctx); err != nil {
		t.Fatalf("Ping failed: %v", err)
	}

	// Test Info
	info, err := provider.Info(ctx)
	if err != nil {
		t.Fatalf("Info failed: %v", err)
	}
	t.Logf("Podman Info: OS=%s", info.OS)

	// Test ListContainers
	containers, err := provider.ListContainers(ctx, true)
	if err != nil {
		t.Fatalf("ListContainers failed: %v", err)
	}
	t.Logf("Found %d containers", len(containers))
}

// TestPodmanProviderCLIMode tests Podman provider in CLI mode
func TestPodmanProviderCLIMode(t *testing.T) {
	if os.Getenv("RUN_INTEGRATION_TESTS") == "" {
		t.Skip("Skipping integration test: set RUN_INTEGRATION_TESTS=1 to run")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Test CLI mode
	provider, err := NewPodmanProvider("", true)
	if err != nil {
		t.Fatalf("Failed to create Podman CLI provider: %v", err)
	}
	defer provider.Close()

	// Test Ping
	if err := provider.Ping(ctx); err != nil {
		t.Fatalf("Ping failed: %v", err)
	}

	// Test Info
	info, err := provider.Info(ctx)
	if err != nil {
		t.Fatalf("Info failed: %v", err)
	}
	t.Logf("Podman CLI Info: OS=%s", info.OS)

	// Test ListContainers
	containers, err := provider.ListContainers(ctx, true)
	if err != nil {
		t.Fatalf("ListContainers failed: %v", err)
	}
	t.Logf("Found %d containers", len(containers))
}

// TestRuntimeFactoryIntegration tests the runtime factory with both runtimes
func TestRuntimeFactoryIntegration(t *testing.T) {
	if os.Getenv("RUN_INTEGRATION_TESTS") == "" {
		t.Skip("Skipping integration test: set RUN_INTEGRATION_TESTS=1 to run")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Test Docker runtime
	t.Run("DockerRuntime", func(t *testing.T) {
		cfg := RuntimeConfig{
			Type:       RuntimeDocker,
			SocketPath: "unix:///var/run/docker.sock",
			UseCLI:     false,
		}

		provider, err := NewRuntime(cfg)
		if err != nil {
			t.Skipf("Docker not available: %v", err)
		}
		defer provider.Close()

		if err := provider.Ping(ctx); err != nil {
			t.Skipf("Docker not responding: %v", err)
		}

		t.Log("Docker runtime factory test passed")
	})

	// Test Podman runtime (CLI mode)
	t.Run("PodmanRuntimeCLI", func(t *testing.T) {
		cfg := RuntimeConfig{
			Type:       RuntimePodman,
			SocketPath: "",
			UseCLI:     true,
		}

		provider, err := NewRuntime(cfg)
		if err != nil {
			t.Skipf("Failed to create Podman provider: %v", err)
		}
		defer provider.Close()

		if err := provider.Ping(ctx); err != nil {
			t.Skipf("Podman not available: %v", err)
		}

		t.Log("Podman runtime factory test passed")
	})
}

// TestValidateComposePorts tests compose file port validation
func TestValidateComposePorts(t *testing.T) {
	tests := []struct {
		name      string
		compose   string
		wantError bool
	}{
		{
			name: "Valid ports",
			compose: `
version: '3'
services:
  web:
    image: nginx
    ports:
      - "8080:80"
      - "9000:9000"
`,
			wantError: false,
		},
		{
			name: "Invalid privileged port",
			compose: `
version: '3'
services:
  web:
    image: nginx
    ports:
      - "80:80"
`,
			wantError: true,
		},
		{
			name: "Multiple invalid ports",
			compose: `
version: '3'
services:
  web:
    image: nginx
    ports:
      - "443:443"
      - "22:22"
`,
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateComposePorts(tt.compose)
			if (err != nil) != tt.wantError {
				t.Errorf("ValidateComposePorts() error = %v, wantError %v", err, tt.wantError)
			}
		})
	}
}

// TestContainerStats tests metrics collection
func TestContainerStats(t *testing.T) {
	if os.Getenv("RUN_INTEGRATION_TESTS") == "" {
		t.Skip("Skipping integration test: set RUN_INTEGRATION_TESTS=1 to run")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	provider, err := NewDockerProvider("unix:///var/run/docker.sock")
	if err != nil {
		t.Skipf("Docker not available: %v", err)
	}
	defer provider.Close()

	// Get running containers
	containers, err := provider.ListContainers(ctx, false)
	if err != nil {
		t.Skipf("ListContainers failed: %v", err)
	}

	if len(containers) == 0 {
		t.Skip("No running containers to test stats")
	}

	// Test stats for first running container
	container := containers[0]
	stats, err := provider.ContainerStats(ctx, container.ID)
	if err != nil {
		t.Fatalf("ContainerStats failed: %v", err)
	}

	if stats.ContainerID != container.ID {
		t.Errorf("Stats container ID mismatch: got %s, want %s", stats.ContainerID, container.ID)
	}

	t.Logf("Container %s stats: CPU=%.2f%%, Memory=%.2f%%", 
		container.Name, stats.CPUPercent, stats.MemoryPercent)
}
