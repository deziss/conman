package agent

import (
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

const agentIDDir = "/var/lib/conman-agent"
const agentIDFile = "agent-id"

// AgentMode defines how the agent communicates
type AgentMode string

const (
	ModePush   AgentMode = "push"   // Agent pushes data to server
	ModeScrape AgentMode = "scrape" // Server scrapes data from agent
	ModeHybrid AgentMode = "hybrid" // Both push and scrape
)

// Config holds agent configuration
type Config struct {
	// Identity
	AgentID   string `json:"agent_id"`
	AgentName string `json:"agent_name"`

	// Server connection
	ServerURL   string `json:"server_url"`
	ServerToken string `json:"server_token"`

	// Communication mode
	Mode AgentMode `json:"mode"`

	// Collection intervals
	CollectInterval time.Duration `json:"collect_interval"`
	MetricsInterval time.Duration `json:"metrics_interval"`
	HeartbeatInterval time.Duration `json:"heartbeat_interval"`

	// Scrape server settings (when mode is scrape or hybrid)
	ScrapeEnabled bool `json:"scrape_enabled"`
	ScrapePort    int  `json:"scrape_port"`

	// Push settings (when mode is push or hybrid)
	PushEnabled   bool `json:"push_enabled"`
	PushBatchSize int  `json:"push_batch_size"`

	// Container runtime settings
	RuntimeType       string `json:"runtime_type"`        // "docker" or "podman"
	RuntimeSocketPath string `json:"runtime_socket_path"` // e.g., "/var/run/docker.sock" or "/run/user/1000/podman/podman.sock"
	RuntimeUseCLI     bool   `json:"runtime_use_cli"`     // Fallback to CLI if socket unavailable

	// Features
	CollectContainers bool `json:"collect_containers"`
	CollectImages     bool `json:"collect_images"`
	CollectNetworks   bool `json:"collect_networks"`
	CollectVolumes    bool `json:"collect_volumes"`
	CollectMetrics    bool `json:"collect_metrics"`
	CollectEvents     bool `json:"collect_events"`
	
	// Networking
	AdvertisedAddress string `json:"advertised_address"`
}

// LoadConfig loads configuration from environment variables
func LoadConfig() (*Config, error) {
	cfg := &Config{
		// Defaults
		AgentID:           getEnv("AGENT_ID", ""),
		AgentName:         getEnv("AGENT_NAME", ""),
		ServerURL:         getEnv("CONMAN_SERVER_URL", "http://localhost:8080"),
		ServerToken:       getEnv("CONMAN_SERVER_TOKEN", ""),
		Mode:              AgentMode(getEnv("AGENT_MODE", "hybrid")),
		CollectInterval:   parseDuration(getEnv("COLLECT_INTERVAL", "10s")),
		MetricsInterval:   parseDuration(getEnv("METRICS_INTERVAL", "5s")),
		HeartbeatInterval: parseDuration(getEnv("HEARTBEAT_INTERVAL", "30s")),
		ScrapeEnabled:     parseBool(getEnv("SCRAPE_ENABLED", "true")),
		ScrapePort:        parseInt(getEnv("SCRAPE_PORT", "5073")),
		PushEnabled:       parseBool(getEnv("PUSH_ENABLED", "true")),
		PushBatchSize:     parseInt(getEnv("PUSH_BATCH_SIZE", "100")),
		RuntimeType:       getEnv("RUNTIME_TYPE", "docker"),
		RuntimeSocketPath: getEnv("RUNTIME_SOCKET_PATH", "unix:///var/run/docker.sock"),
		RuntimeUseCLI:     parseBool(getEnv("RUNTIME_USE_CLI", "false")),
		CollectContainers: parseBool(getEnv("COLLECT_CONTAINERS", "true")),
		CollectImages:     parseBool(getEnv("COLLECT_IMAGES", "true")),
		CollectNetworks:   parseBool(getEnv("COLLECT_NETWORKS", "true")),
		CollectVolumes:    parseBool(getEnv("COLLECT_VOLUMES", "true")),
		CollectMetrics:    parseBool(getEnv("COLLECT_METRICS", "true")),
		CollectEvents:     parseBool(getEnv("COLLECT_EVENTS", "true")),
		AdvertisedAddress: getEnv("ADVERTISED_ADDRESS", ""),
	}

	// Auto-generate agent ID if not provided, persisting to disk for restart stability
	if cfg.AgentID == "" {
		cfg.AgentID = loadOrGenerateAgentID()
	}

	// Use hostname if agent name not provided
	if cfg.AgentName == "" {
		hostname, err := os.Hostname()
		if err != nil {
			cfg.AgentName = cfg.AgentID[:8]
		} else {
			cfg.AgentName = hostname
		}
	}

	return cfg, nil
}

// loadOrGenerateAgentID reads a persisted agent ID from disk, or generates a new one and saves it.
func loadOrGenerateAgentID() string {
	idPath := filepath.Join(agentIDDir, agentIDFile)

	// Try to read existing ID
	data, err := os.ReadFile(idPath)
	if err == nil {
		id := strings.TrimSpace(string(data))
		if id != "" {
			log.Printf("Loaded persisted agent ID: %s", id)
			return id
		}
	}

	// Generate new ID
	id := uuid.New().String()

	// Attempt to persist (best-effort — may fail if dir is not writable)
	if err := os.MkdirAll(agentIDDir, 0755); err != nil {
		log.Printf("Warning: could not create agent ID directory %s: %v", agentIDDir, err)
		return id
	}
	if err := os.WriteFile(idPath, []byte(id), 0644); err != nil {
		log.Printf("Warning: could not persist agent ID to %s: %v", idPath, err)
	} else {
		log.Printf("Generated and persisted new agent ID: %s", id)
	}

	return id
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func parseDuration(s string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		return 10 * time.Second
	}
	return d
}

func parseBool(s string) bool {
	b, _ := strconv.ParseBool(s)
	return b
}

func parseInt(s string) int {
	i, err := strconv.Atoi(s)
	if err != nil {
		return 0
	}
	return i
}
