package service

import (
	"context"
	"encoding/json"
	"sync"
	"time"
	"fmt"
	"strings"
	"log"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
)

type ContainerStats struct {
	CPUUsage    string
	MemoryUsage string
	DiskIO      string
	LastUpdated time.Time
}

type StatsCollector struct {
	mu           sync.RWMutex
	stats        map[string]*ContainerStats
	prevRawStats map[string]*types.StatsJSON // Keep previous raw stats for delta calculation
	client       FuncDockerClient
}

type FuncDockerClient interface {
    ContainerList(ctx context.Context, options container.ListOptions) ([]types.Container, error)
    ContainerStats(ctx context.Context, containerID string, stream bool) (types.ContainerStats, error)
}

var GlobalStatsCollector *StatsCollector

func InitStatsCollector() {
	GlobalStatsCollector = &StatsCollector{
		stats:        make(map[string]*ContainerStats),
		prevRawStats: make(map[string]*types.StatsJSON),
		client:       GetDockerClient(),
	}
	go GlobalStatsCollector.Start()
}

func GetStatsCollector() *StatsCollector {
	return GlobalStatsCollector
}

func (sc *StatsCollector) Start() {
    log.Println("Starting background stats collector...")
	ticker := time.NewTicker(3 * time.Second) // Poll every 3 seconds
	for range ticker.C {
		sc.collect()
	}
}

func (sc *StatsCollector) collect() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

    // 1. List running containers
	containers, err := sc.client.ContainerList(ctx, container.ListOptions{}) // Default lists only running
	if err != nil {
		log.Println("Error listing containers for stats:", err)
		return
	}

    // 2. Fetch stats for each
	var wg sync.WaitGroup
    // Map to store new raw stats temporarily to update prevRawStats safely at the end
    newRawStats := make(map[string]*types.StatsJSON)
    var rawMu sync.Mutex

    // Semaphore to limit concurrency
    sem := make(chan struct{}, 10)

	for _, c := range containers {
		wg.Add(1)
		go func(cid string) {
			defer wg.Done()
            sem <- struct{}{}
            defer func() { <-sem }()

			stats, err := sc.client.ContainerStats(ctx, cid, false) // stream=false
			if err != nil {
				return
			}
			defer stats.Body.Close()

			var v types.StatsJSON
			if err := json.NewDecoder(stats.Body).Decode(&v); err != nil {
				return
			}

            rawMu.Lock()
            newRawStats[cid] = &v
            rawMu.Unlock()

		}(c.ID)
	}
	wg.Wait()

    // 3. Update Cache with calculated metrics
	sc.mu.Lock()
	defer sc.mu.Unlock()

    // Prune old stats for containers that are no longer running
    validIDs := make(map[string]bool)
    for _, c := range containers {
        validIDs[c.ID] = true
    }
    for id := range sc.stats {
        if !validIDs[id] {
            delete(sc.stats, id)
            delete(sc.prevRawStats, id)
        }
    }

    for id, current := range newRawStats {
        previous, exists := sc.prevRawStats[id]
        
        // Improve CPU calculation:
        // Use current vs previous fetch if available
        // If not, try to use PreCPUStats from the current fetch (though often 0 for one-shot)
        
        // Actually, for one-shot, current.PreCPUStats is usually empty/zero.
        // So we MUST use our cached 'previous' raw stats to calculate delta.
        
        cpuUsage := "0.00%"
        if exists {
            cpuUsage = calculateCPUPercentFromDelta(previous, current)
        } else if current.PreCPUStats.CPUUsage.TotalUsage > 0 {
             // Fallback if PreCPUStats happens to be populated (rare for stream=false)
             cpuUsage = calculateCPUPercent(current)
        }

        sc.stats[id] = &ContainerStats{
            CPUUsage:    cpuUsage,
            MemoryUsage: calculateMemUsage(current),
            DiskIO:      calculateDiskIO(current),
            LastUpdated: time.Now(),
        }

        // Update previous raw stats for next iteration
        sc.prevRawStats[id] = current
    }
}

func (sc *StatsCollector) GetStats(containerID string) *ContainerStats {
	sc.mu.RLock()
	defer sc.mu.RUnlock()
	if s, ok := sc.stats[containerID]; ok {
		return s
	}
	return nil
}


// --- Logic Duplication but needed for independent calculation ---

func calculateCPUPercentFromDelta(vMainPre *types.StatsJSON, vMain *types.StatsJSON) string {
    var (
        cpuPercent = 0.0
        // Calculate delta between our manual snapshots
        cpuDelta = float64(vMain.CPUStats.CPUUsage.TotalUsage) - float64(vMainPre.CPUStats.CPUUsage.TotalUsage)
        systemDelta = float64(vMain.CPUStats.SystemUsage) - float64(vMainPre.CPUStats.SystemUsage)
        onlineCPUs  = float64(vMain.CPUStats.OnlineCPUs)
    )

    if onlineCPUs == 0.0 {
        onlineCPUs = float64(len(vMain.CPUStats.CPUUsage.PercpuUsage))
    }
    if systemDelta > 0.0 && cpuDelta > 0.0 {
        cpuPercent = (cpuDelta / systemDelta) * onlineCPUs * 100.0
    }
    return fmt.Sprintf("%.2f%%", cpuPercent)
}


func calculateCPUPercent(v *types.StatsJSON) string {
    // Standard calculation using internal PreCPUStats
    var (
        cpuPercent = 0.0
        cpuDelta = float64(v.CPUStats.CPUUsage.TotalUsage) - float64(v.PreCPUStats.CPUUsage.TotalUsage)
        systemDelta = float64(v.CPUStats.SystemUsage) - float64(v.PreCPUStats.SystemUsage)
        onlineCPUs  = float64(v.CPUStats.OnlineCPUs)
    )

    if onlineCPUs == 0.0 {
        onlineCPUs = float64(len(v.CPUStats.CPUUsage.PercpuUsage))
    }
    if systemDelta > 0.0 && cpuDelta > 0.0 {
        cpuPercent = (cpuDelta / systemDelta) * onlineCPUs * 100.0
    }
    return fmt.Sprintf("%.2f%%", cpuPercent)
}

func calculateMemUsage(v *types.StatsJSON) string {
    mem := float64(v.MemoryStats.Usage)
    return formatBytes(mem)
}

func calculateDiskIO(v *types.StatsJSON) string {
    var read, write uint64
    for _, bio := range v.BlkioStats.IoServiceBytesRecursive {
        if strings.EqualFold(bio.Op, "Read") {
            read += bio.Value
        }
        if strings.EqualFold(bio.Op, "Write") {
            write += bio.Value
        }
    }
    return fmt.Sprintf("%s / %s", formatBytes(float64(read)), formatBytes(float64(write)))
}

func formatBytes(bytes float64) string {
    if bytes == 0 {
        return "0 B"
    }
    const k = 1024
    sizes := []string{"B", "KB", "MB", "GB", "TB"}
    i := 0
    for bytes >= k && i < len(sizes)-1 {
        bytes /= k
        i++
    }
    return fmt.Sprintf("%.2f %s", bytes, sizes[i])
}
