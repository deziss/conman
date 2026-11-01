package stack

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// StackSpec captures the declarative metadata for a persistent stack.
type StackSpec struct {
	Name       string    `json:"name"`
	Origin     string    `json:"origin"` // "managed", "adopted", "discovered"
	ConfigHash string    `json:"config_hash"`
	UpdatedAt  time.Time `json:"updated_at"`
	Directory  string    `json:"directory"`
}

// Storage manages persistent storage on disk for Docker Compose stacks.
type Storage struct {
	BaseDir string
}

// ResolveStorageDir determines the persistent storage path on the host.
func ResolveStorageDir() string {
	if custom := os.Getenv("CONMAN_DATA_DIR"); custom != "" {
		return filepath.Join(custom, "stacks")
	}

	// If root, use standard FHS location /var/lib/conman/stacks
	if os.Geteuid() == 0 {
		return "/var/lib/conman/stacks"
	}

	// For rootless or developer environments, use ~/.config/conman/stacks
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return filepath.Join(home, ".config", "conman", "stacks")
	}

	// Fallback to /tmp/conman-stacks if no user home
	return "/tmp/conman-stacks"
}

// NewStorage returns a Storage instance rooted at baseDir.
func NewStorage(baseDir string) *Storage {
	if baseDir == "" {
		baseDir = ResolveStorageDir()
	}
	os.MkdirAll(baseDir, 0755)
	return &Storage{BaseDir: baseDir}
}

// ComputeConfigHash computes a deterministic SHA256 hash of compose and env contents.
func ComputeConfigHash(composeContent, envContent string) string {
	h := sha256.New()
	h.Write([]byte(composeContent))
	h.Write([]byte("\n---CONMAN_ENV_BOUNDARY---\n"))
	h.Write([]byte(envContent))
	return hex.EncodeToString(h.Sum(nil))
}

// GetStackDir returns the absolute path for a stack's files.
func (s *Storage) GetStackDir(name string) string {
	return filepath.Join(s.BaseDir, name)
}

// WriteStackFiles atomically writes docker-compose.yml, .env, and .conman.spec.json.
func (s *Storage) WriteStackFiles(name, composeContent, envContent, origin string) (*StackSpec, error) {
	if name == "" {
		return nil, fmt.Errorf("stack name cannot be empty")
	}

	stackDir := s.GetStackDir(name)
	if err := os.MkdirAll(stackDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create stack directory: %w", err)
	}

	// 1. Write docker-compose.yml atomically
	composePath := filepath.Join(stackDir, "docker-compose.yml")
	tmpComposePath := filepath.Join(stackDir, "docker-compose.yml.tmp")
	if err := writeAtomic(tmpComposePath, composePath, []byte(composeContent)); err != nil {
		return nil, fmt.Errorf("failed to write compose file: %w", err)
	}

	// 2. Write .env atomically
	envPath := filepath.Join(stackDir, ".env")
	tmpEnvPath := filepath.Join(stackDir, ".env.tmp")
	if err := writeAtomic(tmpEnvPath, envPath, []byte(envContent)); err != nil {
		return nil, fmt.Errorf("failed to write .env file: %w", err)
	}

	// 3. Update spec metadata
	hash := ComputeConfigHash(composeContent, envContent)
	if origin == "" {
		origin = "managed"
	}

	spec := &StackSpec{
		Name:       name,
		Origin:     origin,
		ConfigHash: hash,
		UpdatedAt:  time.Now().UTC(),
		Directory:  stackDir,
	}

	specData, err := json.MarshalIndent(spec, "", "  ")
	if err == nil {
		specPath := filepath.Join(stackDir, ".conman.spec.json")
		tmpSpecPath := filepath.Join(stackDir, ".conman.spec.json.tmp")
		_ = writeAtomic(tmpSpecPath, specPath, specData)
	}

	return spec, nil
}

// ReadStackFiles reads docker-compose.yml, .env, and the spec manifest.
func (s *Storage) ReadStackFiles(name string) (string, string, *StackSpec, error) {
	stackDir := s.GetStackDir(name)

	composePath := filepath.Join(stackDir, "docker-compose.yml")
	composeBytes, err := os.ReadFile(composePath)
	if err != nil {
		return "", "", nil, fmt.Errorf("failed to read compose file: %w", err)
	}

	envPath := filepath.Join(stackDir, ".env")
	envBytes, _ := os.ReadFile(envPath) // .env is optional

	var spec StackSpec
	specPath := filepath.Join(stackDir, ".conman.spec.json")
	if specBytes, err := os.ReadFile(specPath); err == nil {
		_ = json.Unmarshal(specBytes, &spec)
	} else {
		// Synthesize spec if missing
		spec = StackSpec{
			Name:       name,
			Origin:     "discovered",
			ConfigHash: ComputeConfigHash(string(composeBytes), string(envBytes)),
			UpdatedAt:  time.Now().UTC(),
			Directory:  stackDir,
		}
	}

	return string(composeBytes), string(envBytes), &spec, nil
}

// ListManagedStacks scans the base directory for valid stacks.
func (s *Storage) ListManagedStacks() ([]*StackSpec, error) {
	entries, err := os.ReadDir(s.BaseDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []*StackSpec{}, nil
		}
		return nil, err
	}

	var specs []*StackSpec
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		composePath := filepath.Join(s.BaseDir, name, "docker-compose.yml")
		if _, err := os.Stat(composePath); err == nil {
			_, _, spec, err := s.ReadStackFiles(name)
			if err == nil && spec != nil {
				specs = append(specs, spec)
			}
		}
	}

	return specs, nil
}

// DeleteStackDir removes the stack's files from disk.
func (s *Storage) DeleteStackDir(name string) error {
	dir := s.GetStackDir(name)
	return os.RemoveAll(dir)
}

func writeAtomic(tmpPath, targetPath string, data []byte) error {
	f, err := os.OpenFile(tmpPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return os.Rename(tmpPath, targetPath)
}
