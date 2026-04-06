package service

import (
    "encoding/json"
    "conman-backend/internal/models"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
    "strings"
)

type ComposeService struct {
    DataDir string
}

func NewComposeService() *ComposeService {
    // Determine data directory for stacks
    // Assuming config.AppConfig.DatabaseURL is something like "data/app.db", we use "data/stacks"
    // Or just use "data/stacks" relative to CWD.
    dataDir := "data/stacks"
    if err := os.MkdirAll(dataDir, 0755); err != nil {
        fmt.Printf("Failed to create stacks dir: %v\n", err)
    }
    return &ComposeService{DataDir: dataDir}
}

func (s *ComposeService) Deploy(stack *models.Stack) error {
    stackDir := filepath.Join(s.DataDir, stack.Name)
    if err := os.MkdirAll(stackDir, 0755); err != nil {
        return fmt.Errorf("failed to create stack dir: %w", err)
    }

    // Write compose file
    composePath := filepath.Join(stackDir, "docker-compose.yml")
    if err := os.WriteFile(composePath, []byte(stack.ComposeContent), 0644); err != nil {
        return fmt.Errorf("failed to write compose file: %w", err)
    }

    // Write .env file
    envPath := filepath.Join(stackDir, ".env")
    if err := os.WriteFile(envPath, []byte(stack.EnvContent), 0644); err != nil {
        return fmt.Errorf("failed to write env file: %w", err)
    }

    // Execute docker compose up
    // We use "docker compose" (V2)
    cmd := exec.Command("docker", "compose", "-f", composePath, "--env-file", envPath, "up", "-d", "--remove-orphans")
    cmd.Dir = stackDir
    // Capture output
    output, err := cmd.CombinedOutput()
    if err != nil {
        return fmt.Errorf("compose up failed: %s: %w", string(output), err)
    }

    return nil
}

func (s *ComposeService) Down(stack *models.Stack) error {
    stackDir := filepath.Join(s.DataDir, stack.Name)
    composePath := filepath.Join(stackDir, "docker-compose.yml")
    envPath := filepath.Join(stackDir, ".env")

    cmd := exec.Command("docker", "compose", "-f", composePath, "--env-file", envPath, "down")
    cmd.Dir = stackDir
    output, err := cmd.CombinedOutput()
    if err != nil {
        return fmt.Errorf("compose down failed: %s: %w", string(output), err)
    }
    return nil
}

func (s *ComposeService) GetStatus(stack *models.Stack) (string, error) {
    stackDir := filepath.Join(s.DataDir, stack.Name)
    composePath := filepath.Join(stackDir, "docker-compose.yml")
    
    // Check if running
    // docker compose ps --format json
    cmd := exec.Command("docker", "compose", "-f", composePath, "ps", "--format", "json")
    cmd.Dir = stackDir
    output, err := cmd.CombinedOutput()
    if err != nil {
        return "error", fmt.Errorf("compose ps failed: %s: %w", string(output), err)
    }

    // If output is empty or "[]", it's stopped/inactive. 
    // If it has content, it's active.
    if strings.TrimSpace(string(output)) == "[]" || strings.TrimSpace(string(output)) == "" {
        return "stopped", nil
    }
    return "active", nil
}

type ContainerInfo struct {
    Name    string `json:"Name"`
    State   string `json:"State"`
    Service string `json:"Service"`
    Publishers []struct{
        URL           string `json:"URL"`
        TargetPort    int    `json:"TargetPort"`
        PublishedPort int    `json:"PublishedPort"`
        Protocol      string `json:"Protocol"`
    } `json:"Publishers"`
}

func (s *ComposeService) GetContainers(stack *models.Stack) ([]ContainerInfo, error) {
    stackDir := filepath.Join(s.DataDir, stack.Name)
    composePath := filepath.Join(stackDir, "docker-compose.yml")

    cmd := exec.Command("docker", "compose", "-f", composePath, "ps", "--format", "json")
    cmd.Dir = stackDir
    output, err := cmd.CombinedOutput()
    if err != nil {
        return nil, fmt.Errorf("compose ps failed: %s: %w", string(output), err)
    }

    if strings.TrimSpace(string(output)) == "" || strings.TrimSpace(string(output)) == "[]" {
        return []ContainerInfo{}, nil
    }

    var containers []ContainerInfo
    if err := json.Unmarshal(output, &containers); err != nil {
        return nil, fmt.Errorf("failed to parse compose ps output: %w", err)
    }
    
    return containers, nil
}
