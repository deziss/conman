package stack

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// ReconcileRequest defines parameters for updating and converging a stack
type ReconcileRequest struct {
	Name           string `json:"name"`
	ComposeContent string `json:"compose_content"`
	EnvContent     string `json:"env_content"`
	TargetService  string `json:"target_service,omitempty"`
	ReloadMode     string `json:"reload_mode,omitempty"`
}

// ReconcileResult returns details of the convergence run
type ReconcileResult struct {
	Success    bool       `json:"success"`
	Status     string     `json:"status"`
	Output     string     `json:"output"`
	ConfigHash string     `json:"config_hash"`
	Spec       *StackSpec `json:"spec,omitempty"`
	Timestamp  time.Time  `json:"timestamp"`
}

// NewStorageWithBaseDir is an alias constructor for tests and specific directories
func NewStorageWithBaseDir(baseDir string) *Storage {
	return NewStorage(baseDir)
}

// ValidateComposeYAML validates that content is valid YAML containing a non-empty services section
func ValidateComposeYAML(content string) error {
	var raw map[string]interface{}
	if err := yaml.Unmarshal([]byte(content), &raw); err != nil {
		return fmt.Errorf("yaml syntax error: %w", err)
	}
	if raw == nil {
		return fmt.Errorf("empty compose definition")
	}

	services, ok := raw["services"]
	if !ok || services == nil {
		return fmt.Errorf("compose definition must include a 'services' block")
	}

	servicesMap, isMap := services.(map[string]interface{})
	if !isMap || len(servicesMap) == 0 {
		return fmt.Errorf("'services' block must contain at least one service definition")
	}

	return nil
}

// ParseEnvContent parses an environment file content into a key-value map
func ParseEnvContent(content string) map[string]string {
	result := make(map[string]string)
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		key := strings.TrimSpace(parts[0])
		val := ""
		if len(parts) == 2 {
			val = parts[1]
		}
		result[key] = val
	}
	return result
}

// CreateStackBackup copies active docker-compose.yml and .env to .bak files
func CreateStackBackup(stackDir string) error {
	composePath := filepath.Join(stackDir, "docker-compose.yml")
	envPath := filepath.Join(stackDir, ".env")

	if _, err := os.Stat(composePath); err == nil {
		if err := copyFile(composePath, composePath+".bak"); err != nil {
			return fmt.Errorf("failed to backup compose file: %w", err)
		}
	}
	if _, err := os.Stat(envPath); err == nil {
		if err := copyFile(envPath, envPath+".bak"); err != nil {
			return fmt.Errorf("failed to backup env file: %w", err)
		}
	}
	return nil
}

// RestoreStackBackup restores .bak files back to active compose and env files
func RestoreStackBackup(stackDir string) error {
	composePath := filepath.Join(stackDir, "docker-compose.yml")
	envPath := filepath.Join(stackDir, ".env")

	if _, err := os.Stat(composePath + ".bak"); err == nil {
		if err := copyFile(composePath+".bak", composePath); err != nil {
			return fmt.Errorf("failed to restore compose file: %w", err)
		}
	}
	if _, err := os.Stat(envPath + ".bak"); err == nil {
		if err := copyFile(envPath+".bak", envPath); err != nil {
			return fmt.Errorf("failed to restore env file: %w", err)
		}
	}
	return nil
}

// RemoveStackBackup cleans up .bak files after successful convergence
func RemoveStackBackup(stackDir string) {
	composeBak := filepath.Join(stackDir, "docker-compose.yml.bak")
	envBak := filepath.Join(stackDir, ".env.bak")
	os.Remove(composeBak)
	os.Remove(envBak)
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err = io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}

// ReconcileStack atomically converges a stack with the specified compose and env configs
func ReconcileStack(ctx context.Context, storage *Storage, req ReconcileRequest) (*ReconcileResult, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("stack name is required")
	}

	if err := ValidateComposeYAML(req.ComposeContent); err != nil {
		return nil, fmt.Errorf("invalid compose yaml: %w", err)
	}

	stackDir := storage.GetStackDir(req.Name)
	_ = CreateStackBackup(stackDir)

	spec, err := storage.WriteStackFiles(req.Name, req.ComposeContent, req.EnvContent, "reconfigured")
	if err != nil {
		_ = RestoreStackBackup(stackDir)
		return nil, fmt.Errorf("failed to write stack configuration: %w", err)
	}

	// Prepare Docker Compose up -d command
	composePath := filepath.Join(stackDir, "docker-compose.yml")
	envPath := filepath.Join(stackDir, ".env")

	args := []string{"compose", "-f", composePath}
	if _, err := os.Stat(envPath); err == nil {
		args = append(args, "--env-file", envPath)
	}
	args = append(args, "up", "-d", "--remove-orphans", "--no-build")

	if req.TargetService != "" {
		args = append(args, req.TargetService)
	}

	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Dir = stackDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Convergence failed: Roll back files to prior state
		_ = RestoreStackBackup(stackDir)
		return &ReconcileResult{
			Success: false,
			Status:  "rollback",
			Output:  string(output),
		}, fmt.Errorf("docker compose convergence failed (rolled back): %w\nOutput: %s", err, string(output))
	}

	// Convergence succeeded: Remove backups
	RemoveStackBackup(stackDir)

	return &ReconcileResult{
		Success:    true,
		Status:     "reconciled",
		Output:     string(output),
		ConfigHash: spec.ConfigHash,
		Spec:       spec,
		Timestamp:  time.Now(),
	}, nil
}
