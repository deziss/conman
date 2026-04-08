package runtime

import (
	"fmt"
)

type RuntimeType string

const (
	RuntimeDocker RuntimeType = "docker"
	RuntimePodman RuntimeType = "podman"
)

type RuntimeConfig struct {
	Type       RuntimeType
	SocketPath string
	UseCLI     bool
}

func NewRuntime(cfg RuntimeConfig) (ContainerRuntime, error) {
	switch cfg.Type {
	case RuntimeDocker:
		return NewDockerProvider(cfg.SocketPath)
	case RuntimePodman:
		return NewPodmanProvider(cfg.SocketPath, cfg.UseCLI)
	default:
		return nil, fmt.Errorf("unsupported runtime type: %s", cfg.Type)
	}
}
