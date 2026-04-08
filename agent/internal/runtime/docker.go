package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"conman-agent/pkg/protocol"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/client"
)

type DockerProvider struct {
	cli *client.Client
}

func NewDockerProvider(host string) (*DockerProvider, error) {
	cli, err := client.NewClientWithOpts(
		client.WithHost(host),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}
	return &DockerProvider{cli: cli}, nil
}

func (d *DockerProvider) Ping(ctx context.Context) error {
	_, err := d.cli.Ping(ctx)
	return err
}

func (d *DockerProvider) Info(ctx context.Context) (*protocol.HostInfo, error) {
	info, err := d.cli.Info(ctx)
	if err != nil {
		return nil, err
	}
	version, err := d.cli.ServerVersion(ctx)
	if err != nil {
		return nil, err
	}

	return &protocol.HostInfo{
		Hostname:       info.Name,
		OS:             info.OperatingSystem,
		KernelVersion:  info.KernelVersion,
		CPUs:           info.NCPU,
		MemoryTotal:    info.MemTotal,
		DockerVersion:  version.Version,
		DockerRootDir:  info.DockerRootDir,
		StorageDriver:  info.Driver,
		ContainerCount: info.Containers,
		ImageCount:     info.Images,
	}, nil
}

func (d *DockerProvider) ServerVersion(ctx context.Context) (string, error) {
	v, err := d.cli.ServerVersion(ctx)
	if err != nil {
		return "", err
	}
	return v.Version, nil
}

func (d *DockerProvider) ListContainers(ctx context.Context, all bool) ([]protocol.Container, error) {
	containers, err := d.cli.ContainerList(ctx, container.ListOptions{All: all})
	if err != nil {
		return nil, err
	}

	var result []protocol.Container
	for _, c := range containers {
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}

		var ports []protocol.Port
		for _, p := range c.Ports {
			ports = append(ports, protocol.Port{
				IP:          p.IP,
				PrivatePort: p.PrivatePort,
				PublicPort:  p.PublicPort,
				Type:        p.Type,
			})
		}

		var mounts []protocol.Mount
		for _, m := range c.Mounts {
			mounts = append(mounts, protocol.Mount{
				Type:        string(m.Type),
				Name:        m.Name,
				Source:      m.Source,
				Destination: m.Destination,
				Driver:      m.Driver,
				Mode:        m.Mode,
				RW:          m.RW,
			})
		}

		result = append(result, protocol.Container{
			ID:          c.ID,
			Name:        name,
			Image:       c.Image,
			ImageID:     c.ImageID,
			Command:     c.Command,
			Created:     c.Created,
			State:       c.State,
			Status:      c.Status,
			Ports:       ports,
			Labels:      c.Labels,
			NetworkMode: c.HostConfig.NetworkMode,
			Mounts:      mounts,
		})
	}
	return result, nil
}

func (d *DockerProvider) InspectContainer(ctx context.Context, id string) (*protocol.Container, error) {
	c, err := d.cli.ContainerInspect(ctx, id)
	if err != nil {
		return nil, err
	}

	name := ""
	if len(c.Name) > 0 {
		name = strings.TrimPrefix(c.Name, "/")
	}

	var ports []protocol.Port
	for port, bindings := range c.NetworkSettings.Ports {
		for _, b := range bindings {
			pp := port.Int()
			hp := 0
			fmt.Sscanf(b.HostPort, "%d", &hp)
			ports = append(ports, protocol.Port{
				IP:          b.HostIP,
				PrivatePort: uint16(pp),
				PublicPort:  uint16(hp),
				Type:        port.Proto(),
			})
		}
	}

	var mounts []protocol.Mount
	for _, m := range c.Mounts {
		mounts = append(mounts, protocol.Mount{
			Type:        string(m.Type),
			Name:        m.Name,
			Source:      m.Source,
			Destination: m.Destination,
			Driver:      m.Driver,
			Mode:        m.Mode,
			RW:          m.RW,
		})
	}

	cmd := ""
	if c.Config != nil && len(c.Config.Cmd) > 0 {
		cmd = strings.Join(c.Config.Cmd, " ")
	}

	var created int64
	if t, err := time.Parse(time.RFC3339Nano, c.Created); err == nil {
		created = t.Unix()
	}

	status := ""
	if c.State != nil {
		status = c.State.Status
	}

	return &protocol.Container{
		ID:          c.ID,
		Name:        name,
		Image:       c.Config.Image,
		ImageID:     c.Image,
		Command:     cmd,
		Created:     created,
		State:       status,
		Status:      status,
		Ports:       ports,
		Labels:      c.Config.Labels,
		NetworkMode: string(c.HostConfig.NetworkMode),
		Mounts:      mounts,
	}, nil
}

func (d *DockerProvider) RemoveContainer(ctx context.Context, id string, force bool) error {
	return d.cli.ContainerRemove(ctx, id, container.RemoveOptions{Force: force})
}

func (d *DockerProvider) ContainerStats(ctx context.Context, id string) (*protocol.ContainerMetrics, error) {
	// Note: This is a simplified one-shot implementation
	stats, err := d.cli.ContainerStatsOneShot(ctx, id)
	if err != nil {
		return nil, err
	}
	defer stats.Body.Close()

	var s types.StatsJSON
	if err := json.NewDecoder(stats.Body).Decode(&s); err != nil {
		return nil, err
	}

	// Simplified calculation for this example
	cpuPercent := 0.0
	if s.CPUStats.SystemUsage > 0 {
		cpuPercent = (float64(s.CPUStats.CPUUsage.TotalUsage-s.PreCPUStats.CPUUsage.TotalUsage) /
			float64(s.CPUStats.SystemUsage-s.PreCPUStats.SystemUsage)) *
			float64(s.CPUStats.OnlineCPUs) * 100.0
	}

	memPercent := 0.0
	if s.MemoryStats.Limit > 0 {
		memPercent = float64(s.MemoryStats.Usage) / float64(s.MemoryStats.Limit) * 100
	}

	return &protocol.ContainerMetrics{
		ContainerID:   id,
		Timestamp:     time.Now(),
		CPUPercent:    cpuPercent,
		CPUUsage:      s.CPUStats.CPUUsage.TotalUsage,
		SystemCPU:     s.CPUStats.SystemUsage,
		OnlineCPUs:    s.CPUStats.OnlineCPUs,
		MemoryUsage:   s.MemoryStats.Usage,
		MemoryLimit:   s.MemoryStats.Limit,
		MemoryPercent: memPercent,
		MemoryCache:   s.MemoryStats.Stats["cache"],
	}, nil
}

func (d *DockerProvider) ListImages(ctx context.Context, all bool) ([]protocol.Image, error) {
	images, err := d.cli.ImageList(ctx, image.ListOptions{All: all})
	if err != nil {
		return nil, err
	}

	var result []protocol.Image
	for _, img := range images {
		result = append(result, protocol.Image{
			ID:          img.ID,
			RepoTags:    img.RepoTags,
			RepoDigests: img.RepoDigests,
			Created:     img.Created,
			Size:        img.Size,
			VirtualSize: img.VirtualSize,
			Labels:      img.Labels,
		})
	}
	return result, nil
}

func (d *DockerProvider) InspectImage(ctx context.Context, id string) (*protocol.Image, error) {
	img, _, err := d.cli.ImageInspectWithRaw(ctx, id)
	if err != nil {
		return nil, err
	}

	var created int64
	if t, tErr := time.Parse(time.RFC3339Nano, img.Created); tErr == nil {
		created = t.Unix()
	}

	var labels map[string]string
	if img.Config != nil {
		labels = img.Config.Labels
	}

	return &protocol.Image{
		ID:          img.ID,
		RepoTags:    img.RepoTags,
		RepoDigests: img.RepoDigests,
		Created:     created,
		Size:        img.Size,
		VirtualSize: img.VirtualSize,
		Labels:      labels,
	}, nil
}

func (d *DockerProvider) RemoveImage(ctx context.Context, id string, force bool) error {
	_, err := d.cli.ImageRemove(ctx, id, image.RemoveOptions{Force: force})
	return err
}

func (d *DockerProvider) PullImage(ctx context.Context, imageStr string) error {
	// This requires an auth config in the client
	_, err := d.cli.ImagePull(ctx, imageStr, image.PullOptions{})
	return err
}

func (d *DockerProvider) CheckImageUpdate(ctx context.Context, imageStr string, tag string) (*protocol.ImageUpdate, error) {
	// In a real implementation, this would call the registry API
	// For now, we return a mock or use Docker's pull to check
	return &protocol.ImageUpdate{
		Repository: imageStr,
		Tag:        tag,
		HasUpdate:  false,
	}, nil
}

func (d *DockerProvider) ListNetworks(ctx context.Context) ([]protocol.Network, error) {
	networks, err := d.cli.NetworkList(ctx, types.NetworkListOptions{})
	if err != nil {
		return nil, err
	}

	var result []protocol.Network
	for _, n := range networks {
		var ipamConfig []protocol.IPAMConfig
		for _, cfg := range n.IPAM.Config {
			ipamConfig = append(ipamConfig, protocol.IPAMConfig{
				Subnet:  cfg.Subnet,
				Gateway: cfg.Gateway,
			})
		}

		result = append(result, protocol.Network{
			ID:         n.ID,
			Name:       n.Name,
			Driver:     n.Driver,
			Scope:      n.Scope,
			Internal:   n.Internal,
			Attachable: n.Attachable,
			IPAM: protocol.IPAM{
				Driver: n.IPAM.Driver,
				Config: ipamConfig,
			},
			Labels:  n.Labels,
			Created: n.Created,
		})
	}
	return result, nil
}

func (d *DockerProvider) InspectNetwork(ctx context.Context, id string) (*protocol.Network, error) {
	n, err := d.cli.NetworkInspect(ctx, id, types.NetworkInspectOptions{})
	if err != nil {
		return nil, err
	}

	var ipamConfig []protocol.IPAMConfig
	for _, cfg := range n.IPAM.Config {
		ipamConfig = append(ipamConfig, protocol.IPAMConfig{
			Subnet:  cfg.Subnet,
			Gateway: cfg.Gateway,
		})
	}

	return &protocol.Network{
		ID:         n.ID,
		Name:       n.Name,
		Driver:     n.Driver,
		Scope:      n.Scope,
		Internal:   n.Internal,
		Attachable: n.Attachable,
		IPAM: protocol.IPAM{
			Driver: n.IPAM.Driver,
			Config: ipamConfig,
		},
		Labels:  n.Labels,
		Created: n.Created,
	}, nil
}

func (d *DockerProvider) RemoveNetwork(ctx context.Context, id string) error {
	return d.cli.NetworkRemove(ctx, id)
}

func (d *DockerProvider) ConnectContainerToNetwork(ctx context.Context, containerID, networkID string) error {
	return d.cli.NetworkConnect(ctx, networkID, containerID, nil)
}

func (d *DockerProvider) ListVolumes(ctx context.Context) ([]protocol.Volume, error) {
	vols, err := d.cli.VolumeList(ctx, volume.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []protocol.Volume
	for _, v := range vols.Volumes {
		vol := protocol.Volume{
			Name:       v.Name,
			Driver:     v.Driver,
			Mountpoint: v.Mountpoint,
			CreatedAt:  v.CreatedAt,
			Labels:     v.Labels,
			Scope:      v.Scope,
			Status:     v.Status,
		}
		if v.UsageData != nil {
			vol.UsageData = &protocol.VolumeUsage{
				Size:     v.UsageData.Size,
				RefCount: v.UsageData.RefCount,
			}
		}
		result = append(result, vol)
	}
	return result, nil
}

func (d *DockerProvider) InspectVolume(ctx context.Context, id string) (*protocol.Volume, error) {
	v, err := d.cli.VolumeInspect(ctx, id)
	if err != nil {
		return nil, err
	}

	vol := protocol.Volume{
		Name:       v.Name,
		Driver:     v.Driver,
		Mountpoint: v.Mountpoint,
		CreatedAt:  v.CreatedAt,
		Labels:     v.Labels,
		Scope:      v.Scope,
		Status:     v.Status,
	}
	if v.UsageData != nil {
		vol.UsageData = &protocol.VolumeUsage{
			Size:     v.UsageData.Size,
			RefCount: v.UsageData.RefCount,
		}
	}
	return &vol, nil
}

func (d *DockerProvider) RemoveVolume(ctx context.Context, id string, force bool) error {
	return d.cli.VolumeRemove(ctx, id, force)
}

func (d *DockerProvider) ApplyCompose(ctx context.Context, config string, project string) error {
	// Write config to a temporary file
	tmpFile, err := os.CreateTemp("", "docker-compose-*.yaml")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.WriteString(config); err != nil {
		tmpFile.Close()
		return fmt.Errorf("failed to write compose config: %w", err)
	}
	tmpFile.Close()

	// Execute 'docker compose up -d'
	cmd := exec.CommandContext(ctx, "docker", "compose", "-f", tmpFile.Name(), "-p", project, "up", "-d")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker compose up failed: %w, output: %s", err, string(output))
	}

	return nil
}

func (d *DockerProvider) RemoveStack(ctx context.Context, project string) error {
	cmd := exec.CommandContext(ctx, "docker", "compose", "-p", project, "down")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker compose down failed: %w, output: %s", err, string(output))
	}
	return nil
}

// Client exposes the underlying Docker client for advanced operations (exec, logs streaming, etc.)
func (d *DockerProvider) Client() *client.Client {
	return d.cli
}

func (d *DockerProvider) Close() error {
	return d.cli.Close()
}
