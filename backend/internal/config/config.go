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
	AgentToken     string   `mapstructure:"AGENT_TOKEN"`   // Pre-shared key for agent authentication
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
	viper.SetDefault("AGENT_TOKEN", "") // Empty means agent auth disabled (insecure)

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
	if config.SecretKey == "your-secret-key-here" {
		log.Println("WARNING: Using default SECRET_KEY. Change it before running in production.")
	}
}
