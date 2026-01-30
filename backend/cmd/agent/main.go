package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"conman-backend/internal/agent"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("🚀 Starting Conman Agent...")

	// Load configuration from environment
	cfg, err := agent.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	log.Printf("Agent ID: %s", cfg.AgentID)
	log.Printf("Agent Name: %s", cfg.AgentName)
	log.Printf("Server URL: %s", cfg.ServerURL)
	log.Printf("Mode: %s", cfg.Mode)

	// Create agent instance
	a, err := agent.New(cfg)
	if err != nil {
		log.Fatalf("Failed to create agent: %v", err)
	}

	// Setup graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	// Start agent
	go func() {
		if err := a.Run(ctx); err != nil {
			log.Printf("Agent error: %v", err)
			cancel()
		}
	}()

	log.Println("✅ Agent started successfully")

	// Wait for shutdown signal
	<-sigCh
	log.Println("🛑 Shutting down agent...")

	// Give agent time to cleanup
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := a.Shutdown(shutdownCtx); err != nil {
		log.Printf("Error during shutdown: %v", err)
	}

	log.Println("👋 Agent stopped")
}
