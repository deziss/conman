package agent

import (
	"context"
	"log"

	"conman-agent/pkg/protocol"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
)

// collectHostInfo gathers host and runtime information
func (a *Agent) collectHostInfo(ctx context.Context) error {
	info, err := a.runtime.Info(ctx)
	if err != nil {
		return err
	}

	version, err := a.runtime.ServerVersion(ctx)
	if err != nil {
		return err
	}

	a.mu.Lock()
	a.hostInfo = info
	// Update version field
	a.hostInfo.DockerVersion = version
	a.mu.Unlock()

	return nil
}

// collectContainers collects all container information
func (a *Agent) collectContainers(ctx context.Context) error {
	containers, err := a.runtime.ListContainers(ctx, true)
	if err != nil {
		return err
	}

	a.mu.Lock()
	a.containers = containers
	a.mu.Unlock()

	return nil
}

// collectImages collects all image information
func (a *Agent) collectImages(ctx context.Context) error {
	images, err := a.runtime.ListImages(ctx, true)
	if err != nil {
		return err
	}

	a.mu.Lock()
	a.images = images
	a.mu.Unlock()
	
	log.Printf("Collected %d images", len(images))

	return nil
}

// collectNetworks collects all network information
func (a *Agent) collectNetworks(ctx context.Context) error {
	networks, err := a.runtime.ListNetworks(ctx)
	if err != nil {
		return err
	}

	a.mu.Lock()
	a.networks = networks
	a.mu.Unlock()
	
	log.Printf("Collected %d networks", len(networks))

	return nil
}

// collectVolumes collects all volume information
func (a *Agent) collectVolumes(ctx context.Context) error {
	volumes, err := a.runtime.ListVolumes(ctx)
	if err != nil {
		return err
	}

	a.mu.Lock()
	a.volumes = volumes
	a.mu.Unlock()
	
	log.Printf("Collected %d volumes", len(volumes))

	return nil
}

// collectMetrics collects real-time metrics for all running containers
func (a *Agent) collectMetrics(ctx context.Context) error {
	// Get only running containers
	containers, err := a.runtime.ListContainers(ctx, false)
	if err != nil {
		return err
	}

	var metrics []protocol.ContainerMetrics
	for _, c := range containers {
		m, err := a.runtime.ContainerStats(ctx, c.ID)
		if err != nil {
			continue
		}
		metrics = append(metrics, *m)
	}

	a.mu.Lock()
	a.metrics = metrics
	a.mu.Unlock()

	return nil
}

// collectSystemStats collects host system metrics using gopsutil
func (a *Agent) collectSystemStats(ctx context.Context) error {
	v, err := mem.VirtualMemory()
	if err != nil {
		return err
	}

	c, err := cpu.Percent(0, false)
	if err != nil {
		return err
	}
	cpuPercent := 0.0
	if len(c) > 0 {
		cpuPercent = c[0]
	}

	d, err := disk.Usage("/")
	if err != nil {
		return err
	}

	stats := &protocol.SystemStats{
		CPUPercent:    cpuPercent,
		MemoryTotal:   v.Total,
		MemoryUsed:    v.Used,
		MemoryPercent: v.UsedPercent,
		DiskTotal:     d.Total,
		DiskUsed:      d.Used,
		DiskPercent:   d.UsedPercent,
	}

	a.mu.Lock()
	a.stats = stats
	a.mu.Unlock()

	return nil
}
