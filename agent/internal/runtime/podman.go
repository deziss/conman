package runtime

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"conman-agent/pkg/protocol"

	"github.com/docker/docker/client"
)

type PodmanProvider struct {
	cli        *client.Client
	socketPath string
	useCLI     bool
}

func NewPodmanProvider(socketPath string, useCLI bool) (*PodmanProvider, error) {
	var cli *client.Client
	var err error

	if !useCLI {
		cli, err = client.NewClientWithOpts(
			client.WithHost("unix://"+socketPath),
			client.WithAPIVersionNegotiation(),
		)
		if err != nil {
			return nil, fmt.Errorf("failed to create Podman API client: %w", err)
		}
	}

	return &PodmanProvider{
		cli:        cli,
		socketPath: socketPath,
		useCLI:     useCLI,
	}, nil
}

func (p *PodmanProvider) Ping(ctx context.Context) error {
	if p.useCLI {
		return exec.CommandContext(ctx, "podman", "info").Run()
	}
	if p.cli == nil {
		return fmt.Errorf("podman API client not initialized")
	}
	_, err := p.cli.Ping(ctx)
	return err
}

func (p *PodmanProvider) Info(ctx context.Context) (*protocol.HostInfo, error) {
	if p.useCLI {
		// In a real implementation, we would parse 'podman info --format json'
		return &protocol.HostInfo{
			OS: "Linux (Podman CLI)",
		}, nil
	}
	
	// Reuse Docker provider logic via API
	dockerProv := &DockerProvider{cli: p.cli}
	return dockerProv.Info(ctx)
}

func (p *PodmanProvider) ServerVersion(ctx context.Context) (string, error) {
	if p.useCLI {
		out, err := exec.CommandContext(ctx, "podman", "version", "--format", "{{.Version}}").Output()
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(out)), nil
	}
	return dockerProvVersion(p.cli, ctx)
}

func dockerProvVersion(cli *client.Client, ctx context.Context) (string, error) {
	v, err := cli.ServerVersion(ctx)
	if err != nil {
		return "", err
	}
	return v.Version, nil
}

func (p *PodmanProvider) ListContainers(ctx context.Context, all bool) ([]protocol.Container, error) {
	if p.useCLI {
		// Implementation would call 'podman ps --all --format json'
		return nil, fmt.Errorf("ListContainers CLI mode not yet implemented")
	}
	dockerProv := &DockerProvider{cli: p.cli}
	return dockerProv.ListContainers(ctx, all)
}

func (p *PodmanProvider) InspectContainer(ctx context.Context, id string) (*protocol.Container, error) {
	if p.useCLI {
		return nil, fmt.Errorf("InspectContainer CLI mode not yet implemented")
	}
	dockerProv := &DockerProvider{cli: p.cli}
	return dockerProv.InspectContainer(ctx, id)
}

func (p *PodmanProvider) RemoveContainer(ctx context.Context, id string, force bool) error {
	if p.useCLI {
		return exec.CommandContext(ctx, "podman", "rm", "-f", id).Run()
	}
	dockerProv := &DockerProvider{cli: p.cli}
	return dockerProv.RemoveContainer(ctx, id, force)
}

func (p *PodmanProvider) ContainerStats(ctx context.Context, id string) (*protocol.ContainerMetrics, error) {
	if p.useCLI {
		return nil, fmt.Errorf("ContainerStats CLI mode not yet implemented")
	}
	dockerProv := &DockerProvider{cli: p.cli}
	return dockerProv.ContainerStats(ctx, id)
}

func (p *PodmanProvider) ListImages(ctx context.Context, all bool) ([]protocol.Image, error) {
	if p.useCLI {
		return nil, fmt.Errorf("ListImages CLI mode not yet implemented")
	}
	dockerProv := &DockerProvider{cli: p.cli}
	return dockerProv.ListImages(ctx, all)
}

func (p *PodmanProvider) InspectImage(ctx context.Context, id string) (*protocol.Image, error) {
	if p.useCLI {
		return nil, fmt.Errorf("InspectImage CLI mode not yet implemented")
	}
	dockerProv := &DockerProvider{cli: p.cli}
	return dockerProv.InspectImage(ctx, id)
}

func (p *PodmanProvider) RemoveImage(ctx context.Context, id string, force bool) error {
	if p.useCLI {
		return exec.CommandContext(ctx, "podman", "rmi", "-f", id).Run()
	}
	dockerProv := &DockerProvider{cli: p.cli}
	return dockerProv.RemoveImage(ctx, id, force)
}

func (p *PodmanProvider) PullImage(ctx context.Context, imageStr string) error {
	if p.useCLI {
		return exec.CommandContext(ctx, "podman", "pull", imageStr).Run()
	}
	dockerProv := &DockerProvider{cli: p.cli}
	return dockerProv.PullImage(ctx, imageStr)
}

func (p *PodmanProvider) CheckImageUpdate(ctx context.Context, imageStr string, tag string) (*protocol.ImageUpdate, error) {
	return &protocol.ImageUpdate{
		Repository: imageStr,
		Tag:        tag,
		HasUpdate:  false,
	}, nil
}

func (p *PodmanProvider) ListNetworks(ctx context.Context) ([]protocol.Network, error) {
	if p.useCLI {
		return nil, fmt.Errorf("ListNetworks CLI mode not yet implemented")
	}
	dockerProv := &DockerProvider{cli: p.cli}
	return dockerProv.ListNetworks(ctx)
}

func (p *PodmanProvider) InspectNetwork(ctx context.Context, id string) (*protocol.Network, error) {
	if p.useCLI {
		return nil, fmt.Errorf("InspectNetwork CLI mode not yet implemented")
	}
	dockerProv := &DockerProvider{cli: p.cli}
	return dockerProv.InspectNetwork(ctx, id)
}

func (p *PodmanProvider) RemoveNetwork(ctx context.Context, id string) error {
	if p.useCLI {
		return exec.CommandContext(ctx, "podman", "network", "rm", id).Run()
	}
	dockerProv := &DockerProvider{cli: p.cli}
	return dockerProv.RemoveNetwork(ctx, id)
}

func (p *PodmanProvider) ConnectContainerToNetwork(ctx context.Context, containerID, networkID string) error {
	if p.useCLI {
		return exec.CommandContext(ctx, "podman", "network", "connect", networkID, containerID).Run()
	}
	dockerProv := &DockerProvider{cli: p.cli}
	return dockerProv.ConnectContainerToNetwork(ctx, containerID, networkID)
}

func (p *PodmanProvider) ListVolumes(ctx context.Context) ([]protocol.Volume, error) {
	if p.useCLI {
		return nil, fmt.Errorf("ListVolumes CLI mode not yet implemented")
	}
	dockerProv := &DockerProvider{cli: p.cli}
	return dockerProv.ListVolumes(ctx)
}

func (p *PodmanProvider) InspectVolume(ctx context.Context, id string) (*protocol.Volume, error) {
	if p.useCLI {
		return nil, fmt.Errorf("InspectVolume CLI mode not yet implemented")
	}
	dockerProv := &DockerProvider{cli: p.cli}
	return dockerProv.InspectVolume(ctx, id)
}

func (p *PodmanProvider) RemoveVolume(ctx context.Context, id string, force bool) error {
	if p.useCLI {
		return exec.CommandContext(ctx, "podman", "volume", "rm", id).Run()
	}
	dockerProv := &DockerProvider{cli: p.cli}
	return dockerProv.RemoveVolume(ctx, id, force)
}

func (p *PodmanProvider) ApplyCompose(ctx context.Context, config string, project string) error {
	// Write config to a temporary file
	tmpFile, err := os.CreateTemp("", "podman-compose-*.yaml")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.WriteString(config); err != nil {
		tmpFile.Close()
		return fmt.Errorf("failed to write compose config: %w", err)
	}
	tmpFile.Close()

	// Execute 'podman compose up -d'
	cmd := exec.CommandContext(ctx, "podman", "compose", "-f", tmpFile.Name(), "-p", project, "up", "-d")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("podman compose up failed: %w, output: %s", err, string(output))
	}

	return nil
}

func (p *PodmanProvider) RemoveStack(ctx context.Context, project string) error {
	cmd := exec.CommandContext(ctx, "podman", "compose", "-p", project, "down")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("podman compose down failed: %w, output: %s", err, string(output))
	}
	return nil
}

// Client exposes the underlying Docker-compatible client for advanced operations.
func (p *PodmanProvider) Client() *client.Client {
	return p.cli
}

func (p *PodmanProvider) Close() error {
	if p.cli != nil {
		return p.cli.Close()
	}
	return nil
}
