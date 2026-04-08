package runtime

import (
	"context"

	"conman-agent/pkg/protocol"
)

// ContainerRuntime defines the interface for interacting with container engines (Docker, Podman, etc.)
type ContainerRuntime interface {
	// Lifecycle & Info
	Ping(ctx context.Context) error
	Info(ctx context.Context) (*protocol.HostInfo, error)
	ServerVersion(ctx context.Context) (string, error)

	// Containers
	ListContainers(ctx context.Context, all bool) ([]protocol.Container, error)
	InspectContainer(ctx context.Context, id string) (*protocol.Container, error)
	RemoveContainer(ctx context.Context, id string, force bool) error
	ContainerStats(ctx context.Context, id string) (*protocol.ContainerMetrics, error)

	// Images
	ListImages(ctx context.Context, all bool) ([]protocol.Image, error)
	InspectImage(ctx context.Context, id string) (*protocol.Image, error)
	RemoveImage(ctx context.Context, id string, force bool) error
	PullImage(ctx context.Context, image string) error
	CheckImageUpdate(ctx context.Context, image string, tag string) (*protocol.ImageUpdate, error)

	// Networks
	ListNetworks(ctx context.Context) ([]protocol.Network, error)
	InspectNetwork(ctx context.Context, id string) (*protocol.Network, error)
	RemoveNetwork(ctx context.Context, id string) error
	ConnectContainerToNetwork(ctx context.Context, containerID, networkID string) error

	// Volumes
	ListVolumes(ctx context.Context) ([]protocol.Volume, error)
	InspectVolume(ctx context.Context, id string) (*protocol.Volume, error)
	RemoveVolume(ctx context.Context, id string, force bool) error

	// Orchestration
	ApplyCompose(ctx context.Context, config string, project string) error
	RemoveStack(ctx context.Context, project string) error

	// Close connection
	Close() error
}
