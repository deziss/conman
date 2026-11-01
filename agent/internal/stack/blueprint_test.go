package stack

import (
	"strings"
	"testing"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/go-connections/nat"
)

func TestSynthesizeBlueprintFromContainer(t *testing.T) {
	mockContainer := types.ContainerJSON{
		ContainerJSONBase: &types.ContainerJSONBase{
			Name: "/my-running-api",
			HostConfig: &container.HostConfig{
				RestartPolicy: container.RestartPolicy{
					Name: "unless-stopped",
				},
				PortBindings: nat.PortMap{
					"8080/tcp": []nat.PortBinding{
						{HostIP: "0.0.0.0", HostPort: "8080"},
					},
				},
			},
		},
		Config: &container.Config{
			Image: "node:20-alpine",
			Cmd:   []string{"npm", "start"},
			Env: []string{
				"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
				"HOSTNAME=3a4b5c",
				"NODE_ENV=production",
				"PORT=8080",
				"DATABASE_URL=postgres://user:pass@db:5432/app",
			},
		},
		Mounts: []types.MountPoint{
			{
				Type:        "volume",
				Name:        "api-uploads",
				Destination: "/app/uploads",
			},
		},
		NetworkSettings: &types.NetworkSettings{
			Networks: map[string]*network.EndpointSettings{
				"app-net": {},
			},
		},
	}

	stackName := "my-running-api"
	composeYAML, envContent, err := SynthesizeComposeFromInspect(stackName, &mockContainer)
	if err != nil {
		t.Fatalf("SynthesizeComposeFromInspect failed: %v", err)
	}

	// Verify env content has user envs and excluded system PATH/HOSTNAME
	if !strings.Contains(envContent, "NODE_ENV=production") {
		t.Errorf("expected env to contain NODE_ENV=production, got:\n%s", envContent)
	}
	if !strings.Contains(envContent, "DATABASE_URL=postgres://user:pass@db:5432/app") {
		t.Errorf("expected env to contain DATABASE_URL, got:\n%s", envContent)
	}
	if strings.Contains(envContent, "HOSTNAME=") {
		t.Errorf("env should not contain system HOSTNAME")
	}

	// Verify YAML content has ports, volume, restart policy
	if !strings.Contains(composeYAML, "image: node:20-alpine") {
		t.Errorf("expected compose to contain image, got:\n%s", composeYAML)
	}
	if !strings.Contains(composeYAML, "8080:8080") {
		t.Errorf("expected compose to contain port mapping 8080:8080, got:\n%s", composeYAML)
	}
	if !strings.Contains(composeYAML, "restart: unless-stopped") {
		t.Errorf("expected compose to contain restart policy, got:\n%s", composeYAML)
	}
	if !strings.Contains(composeYAML, "env_file:") {
		t.Errorf("expected compose to reference env_file, got:\n%s", composeYAML)
	}
}
