package runtime

import (
	"context"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"syscall"
	"time"

	"conman-agent/pkg/protocol"

	containerd "github.com/containerd/containerd"
	"github.com/containerd/containerd/namespaces"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
)

// ContainerdProvider implements ContainerRuntime for containerd.
type ContainerdProvider struct {
	client    *containerd.Client
	namespace string
}

// NewContainerdProvider connects to containerd via Unix socket.
func NewContainerdProvider(socketPath string, namespace string) (*ContainerdProvider, error) {
	if namespace == "" {
		namespace = "default"
	}
	// Strip unix:// prefix if present
	socketPath = strings.TrimPrefix(socketPath, "unix://")

	client, err := containerd.New(socketPath, containerd.WithDefaultNamespace(namespace))
	if err != nil {
		return nil, fmt.Errorf("failed to create containerd client: %w", err)
	}
	return &ContainerdProvider{client: client, namespace: namespace}, nil
}

func (c *ContainerdProvider) nsCtx(ctx context.Context) context.Context {
	return namespaces.WithNamespace(ctx, c.namespace)
}

// --- Lifecycle & Info ---

func (c *ContainerdProvider) Ping(ctx context.Context) error {
	serving, err := c.client.IsServing(ctx)
	if err != nil {
		return err
	}
	if !serving {
		return fmt.Errorf("containerd is not serving")
	}
	return nil
}

func (c *ContainerdProvider) Info(ctx context.Context) (*protocol.HostInfo, error) {
	ver, err := c.client.Version(ctx)
	if err != nil {
		return nil, err
	}

	info := &protocol.HostInfo{
		RuntimeType:    "containerd",
		RuntimeVersion: ver.Version,
		Namespace:      c.namespace,
		StorageDriver:  "overlayfs", // default snapshotter
	}

	// Use gopsutil for host info (containerd doesn't report this)
	if h, err := host.Info(); err == nil {
		info.Hostname = h.Hostname
		info.OS = h.OS + " " + h.PlatformVersion
		info.Architecture = h.KernelArch
		info.KernelVersion = h.KernelVersion
	}
	if cpus, err := cpu.Counts(true); err == nil {
		info.CPUs = cpus
	}
	if m, err := mem.VirtualMemory(); err == nil {
		info.MemoryTotal = int64(m.Total)
	}

	// Count containers and images
	containers, _ := c.client.Containers(c.nsCtx(ctx))
	info.ContainerCount = len(containers)
	images, _ := c.client.ListImages(c.nsCtx(ctx))
	info.ImageCount = len(images)

	// Backward compat
	info.DockerVersion = "containerd " + ver.Version

	return info, nil
}

func (c *ContainerdProvider) ServerVersion(ctx context.Context) (string, error) {
	ver, err := c.client.Version(ctx)
	if err != nil {
		return "", err
	}
	return ver.Version, nil
}

// --- Containers ---

func (c *ContainerdProvider) ListContainers(ctx context.Context, all bool) ([]protocol.Container, error) {
	nsCtx := c.nsCtx(ctx)
	containers, err := c.client.Containers(nsCtx)
	if err != nil {
		return nil, err
	}

	var result []protocol.Container
	for _, ctr := range containers {
		info, err := ctr.Info(nsCtx)
		if err != nil {
			continue
		}

		state := "created"
		status := "created"
		task, err := ctr.Task(nsCtx, nil)
		if err == nil {
			taskStatus, err := task.Status(nsCtx)
			if err == nil {
				state = string(taskStatus.Status)
				status = string(taskStatus.Status)
			}
		}

		// Skip non-running containers if all=false
		if !all && state != "running" {
			continue
		}

		name := info.Labels["io.containerd.container.name"]
		if name == "" {
			name = info.ID[:12]
		}

		result = append(result, protocol.Container{
			ID:      info.ID,
			Name:    name,
			Image:   info.Image,
			ImageID: info.Image,
			Created: info.CreatedAt.Unix(),
			State:   state,
			Status:  status,
			Labels:  info.Labels,
		})
	}
	return result, nil
}

func (c *ContainerdProvider) InspectContainer(ctx context.Context, id string) (*protocol.Container, error) {
	nsCtx := c.nsCtx(ctx)
	ctr, err := c.client.LoadContainer(nsCtx, id)
	if err != nil {
		return nil, err
	}

	info, err := ctr.Info(nsCtx)
	if err != nil {
		return nil, err
	}

	state := "created"
	task, err := ctr.Task(nsCtx, nil)
	if err == nil {
		if taskStatus, err := task.Status(nsCtx); err == nil {
			state = string(taskStatus.Status)
		}
	}

	name := info.Labels["io.containerd.container.name"]
	if name == "" {
		name = info.ID[:12]
	}

	return &protocol.Container{
		ID:      info.ID,
		Name:    name,
		Image:   info.Image,
		ImageID: info.Image,
		Created: info.CreatedAt.Unix(),
		State:   state,
		Status:  state,
		Labels:  info.Labels,
	}, nil
}

func (c *ContainerdProvider) RemoveContainer(ctx context.Context, id string, force bool) error {
	nsCtx := c.nsCtx(ctx)
	ctr, err := c.client.LoadContainer(nsCtx, id)
	if err != nil {
		return err
	}

	// Kill the task if running
	task, err := ctr.Task(nsCtx, nil)
	if err == nil {
		if force {
			task.Kill(nsCtx, syscall.SIGKILL)
		}
		task.Delete(nsCtx)
	}

	return ctr.Delete(nsCtx)
}

func (c *ContainerdProvider) ContainerStats(ctx context.Context, id string) (*protocol.ContainerMetrics, error) {
	nsCtx := c.nsCtx(ctx)
	ctr, err := c.client.LoadContainer(nsCtx, id)
	if err != nil {
		return nil, err
	}

	task, err := ctr.Task(nsCtx, nil)
	if err != nil {
		return nil, fmt.Errorf("no running task for container %s: %w", id, err)
	}

	// Get cgroup metrics
	metric, err := task.Metrics(nsCtx)
	if err != nil {
		return nil, err
	}

	// Return basic metrics — full cgroup parsing would require typeurl resolution
	_ = metric
	return &protocol.ContainerMetrics{
		ContainerID: id,
		Timestamp:   time.Now(),
	}, nil
}

func (c *ContainerdProvider) ContainerStart(ctx context.Context, id string) error {
	// containerd containers need a task to run — this is a simplified version
	return ErrNotSupported
}

func (c *ContainerdProvider) ContainerStop(ctx context.Context, id string, timeout *int) error {
	nsCtx := c.nsCtx(ctx)
	ctr, err := c.client.LoadContainer(nsCtx, id)
	if err != nil {
		return err
	}
	task, err := ctr.Task(nsCtx, nil)
	if err != nil {
		return err
	}
	return task.Kill(nsCtx, syscall.SIGTERM)
}

func (c *ContainerdProvider) ContainerRestart(ctx context.Context, id string, timeout *int) error {
	return ErrNotSupported
}

// --- Streaming ---

func (c *ContainerdProvider) ContainerLogs(ctx context.Context, id string, opts LogsOptions) (io.ReadCloser, error) {
	return nil, ErrNotSupported
}

func (c *ContainerdProvider) ContainerStatsStream(ctx context.Context, id string) (io.ReadCloser, error) {
	return nil, ErrNotSupported
}

func (c *ContainerdProvider) ExecInteractive(ctx context.Context, id string, cmd []string) (ExecSession, error) {
	return nil, ErrNotSupported
}

func (c *ContainerdProvider) ListContainerFiles(ctx context.Context, id string, path string) ([]FileEntry, error) {
	return nil, ErrNotSupported
}

func (c *ContainerdProvider) DownloadContainerFile(ctx context.Context, id string, path string) (io.ReadCloser, error) {
	return nil, ErrNotSupported
}

// --- Images ---

func (c *ContainerdProvider) ListImages(ctx context.Context, all bool) ([]protocol.Image, error) {
	nsCtx := c.nsCtx(ctx)
	images, err := c.client.ListImages(nsCtx)
	if err != nil {
		return nil, err
	}

	var result []protocol.Image
	for _, img := range images {
		target := img.Target()
		size, _ := img.Size(nsCtx)
		result = append(result, protocol.Image{
			ID:          target.Digest.String(),
			RepoTags:    []string{img.Name()},
			RepoDigests: []string{target.Digest.String()},
			Size:        size,
			Labels:      img.Labels(),
		})
	}
	return result, nil
}

func (c *ContainerdProvider) InspectImage(ctx context.Context, id string) (*protocol.Image, error) {
	nsCtx := c.nsCtx(ctx)
	img, err := c.client.GetImage(nsCtx, id)
	if err != nil {
		return nil, err
	}
	target := img.Target()
	size, _ := img.Size(nsCtx)
	return &protocol.Image{
		ID:          target.Digest.String(),
		RepoTags:    []string{img.Name()},
		RepoDigests: []string{target.Digest.String()},
		Size:        size,
		Labels:      img.Labels(),
	}, nil
}

func (c *ContainerdProvider) RemoveImage(ctx context.Context, id string, force bool) error {
	nsCtx := c.nsCtx(ctx)
	return c.client.ImageService().Delete(nsCtx, id)
}

func (c *ContainerdProvider) PullImage(ctx context.Context, imageRef string) error {
	nsCtx := c.nsCtx(ctx)
	_, err := c.client.Pull(nsCtx, imageRef, containerd.WithPullUnpack)
	return err
}

func (c *ContainerdProvider) CheckImageUpdate(ctx context.Context, imageStr string, tag string) (*protocol.ImageUpdate, error) {
	return &protocol.ImageUpdate{
		Repository: imageStr,
		Tag:        tag,
		HasUpdate:  false,
	}, nil
}

// --- Networks (containerd uses CNI, not built-in networking) ---

func (c *ContainerdProvider) ListNetworks(ctx context.Context) ([]protocol.Network, error) {
	return []protocol.Network{}, nil // containerd has no built-in networking
}

func (c *ContainerdProvider) InspectNetwork(ctx context.Context, id string) (*protocol.Network, error) {
	return nil, ErrNotSupported
}

func (c *ContainerdProvider) RemoveNetwork(ctx context.Context, id string) error {
	return ErrNotSupported
}

func (c *ContainerdProvider) CreateNetwork(ctx context.Context, name string, driver string) (string, error) {
	return "", ErrNotSupported
}

func (c *ContainerdProvider) DuplicateNetwork(ctx context.Context, srcID string) (string, error) {
	return "", ErrNotSupported
}

func (c *ContainerdProvider) ConnectContainerToNetwork(ctx context.Context, containerID, networkID string) error {
	return ErrNotSupported
}

// --- Volumes (mapped to snapshotter info) ---

func (c *ContainerdProvider) ListVolumes(ctx context.Context) ([]protocol.Volume, error) {
	return []protocol.Volume{}, nil
}

func (c *ContainerdProvider) InspectVolume(ctx context.Context, id string) (*protocol.Volume, error) {
	return nil, ErrNotSupported
}

func (c *ContainerdProvider) RemoveVolume(ctx context.Context, id string, force bool) error {
	return ErrNotSupported
}

// --- System ---

func (c *ContainerdProvider) SystemDiskUsage(ctx context.Context) (*DiskUsage, error) {
	return nil, ErrNotSupported
}

func (c *ContainerdProvider) WatchEvents(ctx context.Context) (<-chan protocol.ContainerEvent, <-chan error) {
	eventsCh := make(chan protocol.ContainerEvent, 100)
	errsCh := make(chan error, 1)

	envelopeCh, envelopeErrCh := c.client.Subscribe(c.nsCtx(ctx), "topic==/containers/*")

	go func() {
		defer close(eventsCh)
		defer close(errsCh)
		for {
			select {
			case <-ctx.Done():
				return
			case err := <-envelopeErrCh:
				if err != nil {
					errsCh <- err
				}
				return
			case env := <-envelopeCh:
				if env == nil {
					return
				}
				// Extract event info from envelope
				topic := env.Topic
				action := topic
				if idx := strings.LastIndex(topic, "/"); idx >= 0 {
					action = topic[idx+1:]
				}
				eventsCh <- protocol.ContainerEvent{
					Action:    action,
					Timestamp: env.Timestamp,
				}
			}
		}
	}()

	return eventsCh, errsCh
}

// --- Orchestration (best-effort via nerdctl) ---

func (c *ContainerdProvider) ApplyCompose(ctx context.Context, config string, project string) error {
	if _, err := exec.LookPath("nerdctl"); err != nil {
		return fmt.Errorf("%w: nerdctl not found in PATH (required for compose on containerd)", ErrNotSupported)
	}
	cmd := exec.CommandContext(ctx, "nerdctl", "compose", "-p", project, "up", "-d")
	cmd.Stdin = strings.NewReader(config)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("nerdctl compose up failed: %w, output: %s", err, string(output))
	}
	return nil
}

func (c *ContainerdProvider) RemoveStack(ctx context.Context, project string) error {
	if _, err := exec.LookPath("nerdctl"); err != nil {
		return fmt.Errorf("%w: nerdctl not found in PATH", ErrNotSupported)
	}
	cmd := exec.CommandContext(ctx, "nerdctl", "compose", "-p", project, "down")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("nerdctl compose down failed: %w, output: %s", err, string(output))
	}
	return nil
}

func (c *ContainerdProvider) Close() error {
	return c.client.Close()
}
