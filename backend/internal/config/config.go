package config

import (
	"github.com/spf13/viper"
	"log"
)

type Config struct {
	Port          string   `mapstructure:"PORT"`
	DatabaseURL   string   `mapstructure:"DATABASE_URL"`
	SecretKey     string   `mapstructure:"SECRET_KEY"`
	CorsOrigins   []string `mapstructure:"CORS_ORIGINS"`
	DockerHost    string   `mapstructure:"DOCKER_HOST"`
	MasterAPIKey  string   `mapstructure:"MASTER_API_KEY"`
	AdminEmail    string   `mapstructure:"ADMIN_EMAIL"`
	AdminPassword string   `mapstructure:"ADMIN_PASSWORD"`
	StaticDir     string   `mapstructure:"STATIC_DIR"` // Path to frontend build
}

var AppConfig *Config

func LoadConfig() {
	viper.SetDefault("PORT", "8000")
	viper.SetDefault("DATABASE_URL", "app.db") // Default to sqlite file
	viper.SetDefault("SECRET_KEY", "your-secret-key-here")
	viper.SetDefault("CORS_ORIGINS", []string{"http://localhost:5173"})
	viper.SetDefault("DOCKER_HOST", "unix:///var/run/docker.sock")
	viper.SetDefault("MASTER_API_KEY", "conman-master-secret-key")
    viper.SetDefault("ADMIN_EMAIL", "admin@example.com")
    viper.SetDefault("ADMIN_PASSWORD", "admin")
	viper.SetDefault("STATIC_DIR", "") // Empty means static serving disabled

	viper.AutomaticEnv()

	config := &Config{}
	if err := viper.Unmarshal(config); err != nil {
		log.Fatal("Error loading config:", err)
	}
	AppConfig = config
}
