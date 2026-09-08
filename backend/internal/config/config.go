package config

import (
	"github.com/spf13/viper"
	"log"
)

type Config struct {
	Port           string   `mapstructure:"PORT"`
	DatabaseURL    string   `mapstructure:"DATABASE_URL"`
	DatabaseDriver string   `mapstructure:"DATABASE_DRIVER"` // "sqlite" (default) or "postgres"
	DatabaseDSN    string   `mapstructure:"DATABASE_DSN"`    // PostgreSQL connection string
	SecretKey      string   `mapstructure:"SECRET_KEY"`
	CorsOrigins    []string `mapstructure:"CORS_ORIGINS"`
	DockerHost     string   `mapstructure:"DOCKER_HOST"`
	MasterAPIKey   string   `mapstructure:"MASTER_API_KEY"`
	AdminEmail     string   `mapstructure:"ADMIN_EMAIL"`
	AdminPassword  string   `mapstructure:"ADMIN_PASSWORD"`
	StaticDir      string   `mapstructure:"STATIC_DIR"`    // Path to frontend build
	AgentToken      string   `mapstructure:"AGENT_TOKEN"`       // Pre-shared key for agent authentication
	LicenseKey     string `mapstructure:"LICENSE_KEY"`     // License key (empty = Community tier)
	LicenciaURL    string `mapstructure:"LICENCIA_URL"`    // Licencia licensing server URL
	LicenciaAPIKey string `mapstructure:"LICENCIA_API_KEY"` // Licencia API key with license:validate scope
}

var AppConfig *Config

func LoadConfig() {
	viper.SetDefault("PORT", "8000")
	viper.SetDefault("DATABASE_URL", "app.db")                                                                   // Default to sqlite file
	viper.SetDefault("DATABASE_DRIVER", "sqlite")                                                                 // "sqlite" or "postgres"
	viper.SetDefault("DATABASE_DSN", "host=localhost port=5432 user=conman password=conman dbname=conman sslmode=disable") // PostgreSQL DSN
	viper.SetDefault("SECRET_KEY", "your-secret-key-here")
	viper.SetDefault("CORS_ORIGINS", []string{"http://localhost:5173"})
	viper.SetDefault("DOCKER_HOST", "unix:///var/run/docker.sock")
	viper.SetDefault("MASTER_API_KEY", "conman-master-secret-key")
    viper.SetDefault("ADMIN_EMAIL", "admin@example.com")
    viper.SetDefault("ADMIN_PASSWORD", "admin")
	viper.SetDefault("STATIC_DIR", "") // Empty means static serving disabled
	viper.SetDefault("AGENT_TOKEN", "")        // Empty means agent auth disabled (insecure)
	viper.SetDefault("LICENSE_KEY", "")      // Empty means Community/Free tier
	viper.SetDefault("LICENCIA_URL", "")     // Licencia server URL (empty = offline mode)
	viper.SetDefault("LICENCIA_API_KEY", "") // Licencia API key with license:validate scope

	viper.AutomaticEnv()

	config := &Config{}
	if err := viper.Unmarshal(config); err != nil {
		log.Fatal("Error loading config:", err)
	}
	AppConfig = config

	// Security warnings
	if config.AgentToken == "" {
		log.Println("WARNING: AGENT_TOKEN not set. Agent endpoints will reject all connections.")
	}
	if config.AdminPassword == "admin" {
		log.Println("WARNING: ADMIN_PASSWORD is set to the default 'admin'. Change it before running in production.")
	}

	// Known-insecure placeholder values shipped in this repo's own compose files
	// and Go defaults. Booting with any of these grants trivial admin bypass
	// (MASTER_API_KEY) or forgeable JWTs (SECRET_KEY), so refuse to start
	// rather than only warn.
	insecureSecretKeys := map[string]bool{
		"your-secret-key-here":                 true, // config.go default
		"your-secret-key-change-in-production": true, // docker-compose.simple.yml / .scaled.yml default
		"change-me-in-production":              true, // packaging/server.env default
		"":                                      true,
	}
	insecureMasterKeys := map[string]bool{
		"conman-master-secret-key": true, // config.go default
		"change-me-in-production":  true, // packaging/server.env default
		"":                         true,
	}

	if insecureSecretKeys[config.SecretKey] {
		log.Fatal("FATAL: SECRET_KEY is unset or a known placeholder value. Set it to a random secret " +
			"(e.g. `openssl rand -hex 32`) before starting the server — refusing to boot with a forgeable JWT signing key.")
	}
	if insecureMasterKeys[config.MasterAPIKey] {
		log.Fatal("FATAL: MASTER_API_KEY is unset or the default placeholder value. Set it to a random secret " +
			"(e.g. `openssl rand -hex 32`) before starting the server — refusing to boot with a known admin bypass key.")
	}
}
