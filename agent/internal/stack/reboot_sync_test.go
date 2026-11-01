package stack

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

func TestRebootPersistenceSimulation(t *testing.T) {
	tempBaseDir, err := os.MkdirTemp("", "conman-reboot-sync-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempBaseDir)

	stackName := "sync-test-stack"

	// 1. First "boot" / run of agent: write initial configuration
	storage1 := NewStorage(tempBaseDir)
	initialCompose := `version: '3.8'
services:
  app:
    image: alpine:latest
    command: ["sleep", "3600"]
    env_file: [.env]
`
	initialEnv := "SYNC_TEST_KEY=version_1\nDATABASE_URL=postgres://v1\n"
	spec1, err := storage1.WriteStackFiles(stackName, initialCompose, initialEnv, "managed")
	if err != nil {
		t.Fatalf("initial write failed: %v", err)
	}

	if spec1.ConfigHash == "" {
		t.Errorf("expected non-empty config hash")
	}

	// 2. Perform live update: change environment variable to version_2
	updatedEnv := "SYNC_TEST_KEY=version_2\nDATABASE_URL=postgres://v2_migrated\n"
	spec2, err := storage1.WriteStackFiles(stackName, initialCompose, updatedEnv, "reconfigured")
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}

	if spec2.ConfigHash == spec1.ConfigHash {
		t.Errorf("config hash should have changed after env update")
	}

	// 3. Simulate host reboot & agent restart:
	// Completely discard memory state of storage1 and instantiate a new storage2 from disk
	storage2 := NewStorage(tempBaseDir)

	readCompose, readEnv, loadedSpec, err := storage2.ReadStackFiles(stackName)
	if err != nil {
		t.Fatalf("failed to read stack after simulated reboot: %v", err)
	}

	if loadedSpec.ConfigHash != spec2.ConfigHash {
		t.Errorf("expected loaded spec hash %s, got %s", spec2.ConfigHash, loadedSpec.ConfigHash)
	}

	if !strings.Contains(readEnv, "SYNC_TEST_KEY=version_2") {
		t.Errorf("persisted env does not contain updated version_2: %s", readEnv)
	}

	parsedEnv := ParseEnvContent(readEnv)
	if parsedEnv["SYNC_TEST_KEY"] != "version_2" {
		t.Errorf("parsed env mismatch: expected version_2, got %s", parsedEnv["SYNC_TEST_KEY"])
	}
	if parsedEnv["DATABASE_URL"] != "postgres://v2_migrated" {
		t.Errorf("parsed env mismatch: expected postgres://v2_migrated, got %s", parsedEnv["DATABASE_URL"])
	}

	if !strings.Contains(readCompose, "image: alpine:latest") {
		t.Errorf("compose manifest corrupted: %s", readCompose)
	}
}

func TestDockerClientInspectionConvergence(t *testing.T) {
	// If Docker daemon is accessible, test that container inspect and blueprint synthesis work end-to-end
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		t.Skip("Docker client not available, skipping live daemon test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, err = cli.Ping(ctx)
	if err != nil {
		t.Skipf("Docker daemon ping failed: %v", err)
	}

	// Mock or live container inspect check
	containers, err := cli.ContainerList(ctx, container.ListOptions{Limit: 1})
	if err != nil || len(containers) == 0 {
		t.Skip("No containers running to test live adoption inspect")
	}

	target := containers[0]
	inspect, err := cli.ContainerInspect(ctx, target.ID)
	if err != nil {
		t.Fatalf("ContainerInspect failed on %s: %v", target.ID, err)
	}

	composeYAML, envContent, err := SynthesizeComposeFromInspect(strings.TrimPrefix(inspect.Name, "/"), &inspect)
	if err != nil {
		t.Fatalf("SynthesizeComposeFromInspect failed: %v", err)
	}

	if composeYAML == "" {
		t.Errorf("Synthesized compose YAML is empty")
	}

	err = ValidateComposeYAML(composeYAML)
	if err != nil {
		t.Errorf("Synthesized compose YAML failed validation: %v\nYAML:\n%s", err, composeYAML)
	}

	_ = envContent
}
