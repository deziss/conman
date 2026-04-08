package runtime

import (
	"fmt"
)

type RuntimeType string

const (
	RuntimeDocker     RuntimeType = "docker"
	RuntimePodman     RuntimeType = "podman"
	RuntimeContainerd RuntimeType = "containerd"
)

type RuntimeConfig struct {
	Type       RuntimeType
	SocketPath string
	UseCLI     bool
	Namespace  string // containerd namespace (default "default")
}

func NewRuntime(cfg RuntimeConfig) (ContainerRuntime, error) {
	switch cfg.Type {
	case RuntimeDocker:
		return NewDockerProvider(cfg.SocketPath)
	case RuntimePodman:
		return NewPodmanProvider(cfg.SocketPath, cfg.UseCLI)
	case RuntimeContainerd:
		ns := cfg.Namespace
		if ns == "" {
			ns = "default"
		}
		return NewContainerdProvider(cfg.SocketPath, ns)
	default:
		return nil, fmt.Errorf("unsupported runtime type: %s", cfg.Type)
	}
}
