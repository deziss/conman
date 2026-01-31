package agent

import (
	"context"
	"encoding/json"
	"log"
	"runtime"
	"strings"
	"time"

	"conman-agent/pkg/protocol"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/volume"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
)

// collectHostInfo gathers host and Docker daemon information
func (a *Agent) collectHostInfo(ctx context.Context) error {
	info, err := a.docker.Info(ctx)
	if err != nil {
		return err
	}

	version, err := a.docker.ServerVersion(ctx)
	if err != nil {
		return err
	}

	a.mu.Lock()
	a.hostInfo = &protocol.HostInfo{
		Hostname:       info.Name,
		OS:             info.OperatingSystem,
		Architecture:   runtime.GOARCH,
		KernelVersion:  info.KernelVersion,
		CPUs:           info.NCPU,
		MemoryTotal:    info.MemTotal,
		DockerVersion:  version.Version,
		DockerRootDir:  info.DockerRootDir,
		StorageDriver:  info.Driver,
		ContainerCount: info.Containers,
		ImageCount:     info.Images,
	}
	a.mu.Unlock()

	return nil
}

// collectContainers collects all container information
func (a *Agent) collectContainers(ctx context.Context) error {
	containers, err := a.docker.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return err
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

	a.mu.Lock()
	a.containers = result
	a.mu.Unlock()

	return nil
}

// collectImages collects all image information
func (a *Agent) collectImages(ctx context.Context) error {
	images, err := a.docker.ImageList(ctx, image.ListOptions{All: true})
	if err != nil {
		return err
	}

	// Get container list to count image usage
	containers, _ := a.docker.ContainerList(ctx, container.ListOptions{All: true})
	imageUsage := make(map[string]int)
	for _, c := range containers {
		imageUsage[c.ImageID]++
	}

	result := make([]protocol.Image, 0)
	for _, img := range images {
		result = append(result, protocol.Image{
			ID:          img.ID,
			RepoTags:    img.RepoTags,
			RepoDigests: img.RepoDigests,
			Created:     img.Created,
			Size:        img.Size,
			VirtualSize: img.Size,
			Labels:      img.Labels,
			Containers:  imageUsage[img.ID],
		})
	}

	a.mu.Lock()
	a.images = result
	a.mu.Unlock()
	
	log.Printf("Collected %d images", len(result)) // Debug log

	return nil
}

// collectNetworks collects all network information
func (a *Agent) collectNetworks(ctx context.Context) error {
	networks, err := a.docker.NetworkList(ctx, types.NetworkListOptions{})
	if err != nil {
		return err
	}

	result := make([]protocol.Network, 0)
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
			Labels:     n.Labels,
			Containers: len(n.Containers),
			Created:    n.Created,
		})
	}

	a.mu.Lock()
	a.networks = result
	a.mu.Unlock()
	
	log.Printf("Collected %d networks", len(result))

	return nil
}

// collectVolumes collects all volume information
func (a *Agent) collectVolumes(ctx context.Context) error {
	volumes, err := a.docker.VolumeList(ctx, volume.ListOptions{})
	if err != nil {
		return err
	}

	result := make([]protocol.Volume, 0)
	for _, v := range volumes.Volumes {
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

	a.mu.Lock()
	a.volumes = result
	a.mu.Unlock()
	
	log.Printf("Collected %d volumes", len(result))

	return nil
}

// collectMetrics collects real-time metrics for all running containers
func (a *Agent) collectMetrics(ctx context.Context) error {
	// Get only running containers
	containers, err := a.docker.ContainerList(ctx, container.ListOptions{
		Filters: filters.NewArgs(filters.Arg("status", "running")),
	})
	if err != nil {
		return err
	}

	var metrics []protocol.ContainerMetrics
	for _, c := range containers {
		// Get stats for each container (one-shot, not streaming)
		stats, err := a.docker.ContainerStatsOneShot(ctx, c.ID)
		if err != nil {
			continue
		}

		var statsJSON types.StatsJSON
		decoder := json.NewDecoder(stats.Body)
		if err := decoder.Decode(&statsJSON); err != nil {
			stats.Body.Close()
			continue
		}
		stats.Body.Close()

		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}

		// Calculate CPU percentage
		cpuPercent := calculateCPUPercent(&statsJSON)

		// Calculate memory percentage
		memPercent := 0.0
		if statsJSON.MemoryStats.Limit > 0 {
			memPercent = float64(statsJSON.MemoryStats.Usage) / float64(statsJSON.MemoryStats.Limit) * 100
		}

		// Calculate network totals
		var netRx, netTx, netRxPkts, netTxPkts uint64
		for _, netStats := range statsJSON.Networks {
			netRx += netStats.RxBytes
			netTx += netStats.TxBytes
			netRxPkts += netStats.RxPackets
			netTxPkts += netStats.TxPackets
		}

		// Calculate block I/O
		var blockRead, blockWrite uint64
		for _, blkIO := range statsJSON.BlkioStats.IoServiceBytesRecursive {
			switch blkIO.Op {
			case "read", "Read":
				blockRead += blkIO.Value
			case "write", "Write":
				blockWrite += blkIO.Value
			}
		}

		metrics = append(metrics, protocol.ContainerMetrics{
			ContainerID:      c.ID,
			ContainerName:    name,
			Timestamp:        time.Now(),
			CPUPercent:       cpuPercent,
			CPUUsage:         statsJSON.CPUStats.CPUUsage.TotalUsage,
			SystemCPU:        statsJSON.CPUStats.SystemUsage,
			OnlineCPUs:       statsJSON.CPUStats.OnlineCPUs,
			MemoryUsage:      statsJSON.MemoryStats.Usage,
			MemoryLimit:      statsJSON.MemoryStats.Limit,
			MemoryPercent:    memPercent,
			MemoryCache:      statsJSON.MemoryStats.Stats["cache"],
			NetworkRx:        netRx,
			NetworkTx:        netTx,
			NetworkRxPackets: netRxPkts,
			NetworkTxPackets: netTxPkts,
			BlockRead:        blockRead,
			BlockWrite:       blockWrite,
			PIDs:             statsJSON.PidsStats.Current,
		})
	}

	a.mu.Lock()
	a.metrics = metrics
	a.mu.Unlock()

	return nil
}

func calculateCPUPercent(stats *types.StatsJSON) float64 {
	cpuDelta := float64(stats.CPUStats.CPUUsage.TotalUsage - stats.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(stats.CPUStats.SystemUsage - stats.PreCPUStats.SystemUsage)

	if systemDelta > 0.0 && cpuDelta > 0.0 {
		cpuPercent := (cpuDelta / systemDelta) * float64(stats.CPUStats.OnlineCPUs) * 100.0
		return cpuPercent
	}
	return 0.0
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
