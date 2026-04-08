package runtime

import (
	"context"
	"errors"
	"io"

	"conman-agent/pkg/protocol"
)

// ErrNotSupported is returned when an operation is not supported by the runtime.
var ErrNotSupported = errors.New("operation not supported by this runtime")

// ContainerRuntime defines the interface for interacting with container engines (Docker, Podman, containerd).
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
	ContainerStart(ctx context.Context, id string) error
	ContainerStop(ctx context.Context, id string, timeout *int) error
	ContainerRestart(ctx context.Context, id string, timeout *int) error

	// Streaming
	ContainerLogs(ctx context.Context, id string, opts LogsOptions) (io.ReadCloser, error)
	ContainerStatsStream(ctx context.Context, id string) (io.ReadCloser, error)
	ExecInteractive(ctx context.Context, id string, cmd []string) (ExecSession, error)
	ListContainerFiles(ctx context.Context, id string, path string) ([]FileEntry, error)
	DownloadContainerFile(ctx context.Context, id string, path string) (io.ReadCloser, error)

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
	CreateNetwork(ctx context.Context, name string, driver string) (string, error)
	DuplicateNetwork(ctx context.Context, srcID string) (string, error)
	ConnectContainerToNetwork(ctx context.Context, containerID, networkID string) error

	// Volumes
	ListVolumes(ctx context.Context) ([]protocol.Volume, error)
	InspectVolume(ctx context.Context, id string) (*protocol.Volume, error)
	RemoveVolume(ctx context.Context, id string, force bool) error

	// System
	SystemDiskUsage(ctx context.Context) (*DiskUsage, error)
	WatchEvents(ctx context.Context) (<-chan protocol.ContainerEvent, <-chan error)

	// Orchestration
	ApplyCompose(ctx context.Context, config string, project string) error
	RemoveStack(ctx context.Context, project string) error

	// Close connection
	Close() error
}

// LogsOptions configures container log streaming.
type LogsOptions struct {
	Follow     bool
	Tail       string // "all" or number of lines
	Since      string // RFC3339 timestamp
	Timestamps bool
}

// ExecSession represents an interactive exec session in a container.
type ExecSession interface {
	io.ReadWriteCloser
	Resize(rows, cols uint) error
}

// FileEntry represents a file or directory inside a container.
type FileEntry struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	Mode    string `json:"mode"`
	ModTime string `json:"mod_time"`
	IsDir   bool   `json:"is_dir"`
}

// DiskUsage represents system-wide disk usage.
type DiskUsage struct {
	ContainersSize int64 `json:"containers_size"`
	ImagesSize     int64 `json:"images_size"`
	VolumesSize    int64 `json:"volumes_size"`
	BuildCacheSize int64 `json:"build_cache_size"`
}

