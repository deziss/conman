package stack

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateComposeYAML(t *testing.T) {
	validYAML := `
version: '3.8'
services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
`
	if err := ValidateComposeYAML(validYAML); err != nil {
		t.Fatalf("expected valid YAML, got error: %v", err)
	}

	invalidSyntaxYAML := `
services:
  web:
    image: nginx:alpine
      broken_indent: true
`
	if err := ValidateComposeYAML(invalidSyntaxYAML); err == nil {
		t.Fatalf("expected syntax error for invalid YAML indentation")
	}

	missingServicesYAML := `
version: '3.8'
networks:
  app-net:
`
	if err := ValidateComposeYAML(missingServicesYAML); err == nil {
		t.Fatalf("expected error for compose YAML missing services")
	}
}

func TestParseEnvContent(t *testing.T) {
	rawEnv := `
# Production environment
PORT=8080
DATABASE_URL=postgres://user:secret@db:5432/app
EMPTY_VAL=
# Comment line
MULTI_EQUALS=foo=bar=baz
`
	parsed := ParseEnvContent(rawEnv)
	if parsed["PORT"] != "8080" {
		t.Errorf("expected PORT=8080, got %q", parsed["PORT"])
	}
	if parsed["DATABASE_URL"] != "postgres://user:secret@db:5432/app" {
		t.Errorf("expected DATABASE_URL to match, got %q", parsed["DATABASE_URL"])
	}
	if parsed["MULTI_EQUALS"] != "foo=bar=baz" {
		t.Errorf("expected MULTI_EQUALS to match, got %q", parsed["MULTI_EQUALS"])
	}
	if _, ok := parsed["EMPTY_VAL"]; !ok {
		t.Errorf("expected EMPTY_VAL to exist in parsed map")
	}
	if len(parsed) != 4 {
		t.Errorf("expected 4 parsed env keys, got %d", len(parsed))
	}
}

func TestReconcilerBackupAndRollback(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "conman-reconcile-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	storage := NewStorageWithBaseDir(tempDir)
	stackName := "test-rollback-stack"

	// Initial valid files
	initialCompose := "services:\n  app:\n    image: alpine\n"
	initialEnv := "FOO=bar\n"
	_, err = storage.WriteStackFiles(stackName, initialCompose, initialEnv, "test")
	if err != nil {
		t.Fatalf("failed to write initial stack: %v", err)
	}

	stackDir := storage.GetStackDir(stackName)

	// Create backup
	err = CreateStackBackup(stackDir)
	if err != nil {
		t.Fatalf("failed to create backup: %v", err)
	}

	// Overwrite with bad content
	composePath := filepath.Join(stackDir, "docker-compose.yml")
	envPath := filepath.Join(stackDir, ".env")
	os.WriteFile(composePath, []byte("broken compose"), 0644)
	os.WriteFile(envPath, []byte("BAD=content"), 0644)

	// Rollback
	err = RestoreStackBackup(stackDir)
	if err != nil {
		t.Fatalf("failed to restore backup: %v", err)
	}

	restoredCompose, _ := os.ReadFile(composePath)
	restoredEnv, _ := os.ReadFile(envPath)

	if !strings.Contains(string(restoredCompose), "image: alpine") {
		t.Errorf("expected rollback to restore initial compose, got:\n%s", string(restoredCompose))
	}
	if !strings.Contains(string(restoredEnv), "FOO=bar") {
		t.Errorf("expected rollback to restore initial env, got:\n%s", string(restoredEnv))
	}
}
