package service

import (
	"context"
	"github.com/docker/docker/client"
	"conman-backend/internal/config"
	"log"
)

var DockerClient *client.Client

func InitDockerClient() {
	var err error
    // Use DOCKER_HOST from config or default environment
	DockerClient, err = client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Fatal("Error initializing Docker client:", err)
	}
    // Ping to verify connection
    _, err = DockerClient.Ping(context.Background())
    if err != nil {
        log.Printf("Warning: Could not connect to Docker daemon at %s: %v", config.AppConfig.DockerHost, err)
    } else {
        log.Println("Successfully connected to Docker daemon")
    }
}

func GetDockerClient() *client.Client {
    return DockerClient
}
