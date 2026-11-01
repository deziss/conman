package stack

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStorageDirResolution(t *testing.T) {
	// Custom env override
	tempDir, err := os.MkdirTemp("", "conman-test-storage-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	os.Setenv("CONMAN_DATA_DIR", tempDir)
	defer os.Unsetenv("CONMAN_DATA_DIR")

	dir := ResolveStorageDir()
	expected := filepath.Join(tempDir, "stacks")
	if dir != expected {
		t.Errorf("expected storage dir %q, got %q", expected, dir)
	}
}

func TestWriteAndReadStackFiles(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "conman-stack-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	store := NewStorage(tempDir)
	stackName := "web-app"
	composeContent := "version: '3.8'\nservices:\n  web:\n    image: nginx:alpine\n"
	envContent := "PORT=8080\nENV=production\n"

	spec, err := store.WriteStackFiles(stackName, composeContent, envContent, "custom")
	if err != nil {
		t.Fatalf("WriteStackFiles failed: %v", err)
	}

	if spec.Name != stackName {
		t.Errorf("expected spec name %q, got %q", stackName, spec.Name)
	}
	if spec.ConfigHash == "" {
		t.Errorf("expected non-empty config hash")
	}

	// Verify reading files back
	readCompose, readEnv, readSpec, err := store.ReadStackFiles(stackName)
	if err != nil {
		t.Fatalf("ReadStackFiles failed: %v", err)
	}

	if readCompose != composeContent {
		t.Errorf("compose content mismatch.\nExpected:\n%s\nGot:\n%s", composeContent, readCompose)
	}
	if readEnv != envContent {
		t.Errorf("env content mismatch.\nExpected:\n%s\nGot:\n%s", envContent, readEnv)
	}
	if readSpec.ConfigHash != spec.ConfigHash {
		t.Errorf("hash mismatch: expected %q, got %q", spec.ConfigHash, readSpec.ConfigHash)
	}
}

func TestAtomicWriteSafety(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "conman-stack-atomic-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	store := NewStorage(tempDir)
	stackName := "db-stack"

	// Write v1
	_, err = store.WriteStackFiles(stackName, "version: '3.8'", "DB=v1", "managed")
	if err != nil {
		t.Fatalf("initial write failed: %v", err)
	}

	// Overwrite v2
	spec2, err := store.WriteStackFiles(stackName, "version: '3.8'\nservices:\n  db:\n    image: postgres:16", "DB=v2\nSECRET=123", "managed")
	if err != nil {
		t.Fatalf("overwrite failed: %v", err)
	}

	_, readEnv, _, err := store.ReadStackFiles(stackName)
	if err != nil {
		t.Fatalf("read after overwrite failed: %v", err)
	}

	if readEnv != "DB=v2\nSECRET=123" {
		t.Errorf("expected v2 env, got %q", readEnv)
	}

	if spec2.Origin != "managed" {
		t.Errorf("expected origin 'managed', got %q", spec2.Origin)
	}
}
